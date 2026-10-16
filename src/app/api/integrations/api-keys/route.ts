import { NextRequest, NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { ApiKey } from '@/models/ApiKey'
import { AuditEvent } from '@/models/AuditEvent'
import { generateApiKey } from '@/lib/apikey'
import { apiKeyCreateSchema } from '@/lib/validation/integrations'

/** Public shape of an API key — never includes the hash or the raw key. */
function toPublicKey(key: any) {
  return {
    _id: String(key._id),
    name: key.name,
    prefix: key.prefix,
    isActive: key.isActive,
    expiresAt: key.expiresAt || null,
    lastUsedAt: key.lastUsedAt || null,
    createdBy: key.createdBy
      ? { _id: String(key.createdBy._id ?? key.createdBy), name: (key.createdBy as any).name }
      : null,
    createdAt: key.createdAt,
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:read')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    await connectDB()

    const keys = await ApiKey.find({ organization: session.user.organizationId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name')
      .lean() as any

    return NextResponse.json({ success: true, data: (keys || []).map(toPublicKey) })
  } catch (error) {
    console.error('List API keys error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:manage')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = apiKeyCreateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    await connectDB()

    const { key, keyHash, prefix } = generateApiKey()
    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const doc = await ApiKey.create({
      organization: session.user.organizationId,
      name: parsed.data.name,
      keyHash,
      prefix,
      createdBy: session.user.id,
      expiresAt,
      isActive: true,
    })

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'APIKEY_CREATE',
      resourceType: 'ApiKey',
      resourceId: doc._id,
      metadata: { name: doc.name, prefix: doc.prefix, expiresAt: doc.expiresAt || null },
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          // Raw key is shown ONCE here and never again.
          apiKey: key,
          key: toPublicKey(doc),
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create API key error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!hasPermission(session.user.role, 'integrations:manage')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get('id')
    if (!id || !Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, error: 'Invalid API key ID' }, { status: 400 })
    }

    await connectDB()

    const key = await ApiKey.findOne({ _id: id, organization: session.user.organizationId })
    if (!key) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 })
    }

    // Revoke rather than delete: the audit trail keeps referencing this id and
    // an inactive key can never authenticate again anyway.
    key.isActive = false
    await key.save()

    await AuditEvent.create({
      organization: session.user.organizationId,
      user: session.user.id,
      action: 'APIKEY_DELETE',
      resourceType: 'ApiKey',
      resourceId: key._id,
      metadata: { name: key.name, prefix: key.prefix },
    })

    return NextResponse.json({ success: true, data: { revoked: true } })
  } catch (error) {
    console.error('Revoke API key error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
