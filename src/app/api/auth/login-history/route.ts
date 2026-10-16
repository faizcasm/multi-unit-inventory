import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth'
import { connectDB } from '@/lib/db/mongodb'
import { LoginEvent } from '@/models/LoginEvent'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    await connectDB()

    const email = (session.user.email || '').trim().toLowerCase()
    const query = email
      ? { $or: [{ user: session.user.id }, { email }] }
      : { user: session.user.id }

    const events = await LoginEvent.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .select('_id status ipAddress userAgent createdAt')
      .lean()

    return NextResponse.json({ success: true, data: events })
  } catch (error) {
    console.error('Login history error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
