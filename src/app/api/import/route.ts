import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { auth } from '@/lib/auth/auth'
import { hasPermission } from '@/lib/permissions'
import { Product } from '@/models/Product'
import { Location } from '@/models/Location'
import { AuditEvent } from '@/models/AuditEvent'
import {
  LocationImportData,
  processLocationCsv,
  processProductCsv,
} from '@/lib/validation/import'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid request body' }, { status: 400 })
    }

    const target = (body as { target?: unknown }).target
    if (target !== 'products' && target !== 'locations') {
      return NextResponse.json(
        { success: false, error: "target must be 'products' or 'locations'" },
        { status: 400 }
      )
    }

    if (!hasPermission(session.user.role, target === 'products' ? 'products:create' : 'locations:create')) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const csv = (body as { csv?: unknown }).csv
    if (typeof csv !== 'string' || !csv.trim()) {
      return NextResponse.json({ success: false, error: 'CSV content is required' }, { status: 400 })
    }

    // Default to dry run — committing should always be explicit.
    const dryRun = (body as { dryRun?: unknown }).dryRun !== false

    await connectDB()
    const organization = session.user.organizationId

    if (target === 'products') {
      const existing = (await Product.find({ organization }, { sku: 1 }).lean()) as any[]
      const existingKeys = new Set<string>(existing.map((p) => String(p.sku).toLowerCase()))
      const processed = processProductCsv(csv, existingKeys)
      if ('error' in processed) {
        return NextResponse.json({ success: false, error: processed.error }, { status: 400 })
      }
      const { totalRows, valid, invalid, duplicates } = processed

      if (!dryRun) {
        const docs = valid.map((row) => ({ ...row.data, organization }))
        let imported = 0
        if (docs.length > 0) {
          try {
            const inserted = await Product.insertMany(docs, { ordered: false })
            imported = inserted.length
          } catch (insertError: any) {
            // ordered:false — rows that did make it in still count.
            imported = insertError?.insertedDocs?.length ?? 0
          }
        }
        await AuditEvent.create({
          organization,
          user: session.user.id,
          action: 'PRODUCT_IMPORT',
          resourceType: 'Product',
          metadata: { imported, invalid: invalid.length, duplicates: duplicates.length },
        })
        return NextResponse.json({
          success: true,
          data: { imported, invalid: invalid.length, duplicates: duplicates.length },
        })
      }

      return NextResponse.json({
        success: true,
        data: {
          target,
          totalRows,
          valid: valid.length,
          invalid,
          duplicates,
          preview: valid.slice(0, 10).map((row) => row.data),
        },
      })
    }

    // target === 'locations'
    const existing = (await Location.find({ organization }, { code: 1 }).lean()) as any[]
    const existingKeys = new Set<string>(existing.map((l) => String(l.code).toLowerCase()))
    const processed = processLocationCsv(csv, existingKeys)
    if ('error' in processed) {
      return NextResponse.json({ success: false, error: processed.error }, { status: 400 })
    }
    const { totalRows, valid, invalid, duplicates } = processed

    if (!dryRun) {
      const docs = valid.map((row) => {
        const data: LocationImportData = row.data
        // `capacity` is validated but intentionally not persisted — the model
        // has no such field (strict mode would drop it anyway).
        return {
          organization,
          name: data.name,
          code: data.code,
          type: data.type,
          ...(data.description ? { description: data.description } : {}),
          ...(data.address ? { address: data.address } : {}),
        }
      })
      let imported = 0
      if (docs.length > 0) {
        try {
          const inserted = await Location.insertMany(docs, { ordered: false })
          imported = inserted.length
        } catch (insertError: any) {
          imported = insertError?.insertedDocs?.length ?? 0
        }
      }
      await AuditEvent.create({
        organization,
        user: session.user.id,
        action: 'LOCATION_IMPORT',
        resourceType: 'Location',
        metadata: { imported, invalid: invalid.length, duplicates: duplicates.length },
      })
      return NextResponse.json({
        success: true,
        data: { imported, invalid: invalid.length, duplicates: duplicates.length },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        target,
        totalRows,
        valid: valid.length,
        invalid,
        duplicates,
        preview: valid.slice(0, 10).map((row) => {
          const data: LocationImportData = row.data
          return {
            name: data.name,
            code: data.code,
            type: data.type,
            city: data.address?.city || '',
            country: data.address?.country || '',
            description: data.description || '',
            capacity: data.capacity ?? '',
          }
        }),
      },
    })
  } catch (error) {
    console.error('CSV import error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
