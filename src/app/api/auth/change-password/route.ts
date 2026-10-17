import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { auth } from '@/lib/auth/auth'
import { clientIp } from '@/lib/rate-limit'
import { tooManyAttempts } from '@/lib/auth-throttle'

const FIFTEEN_MIN_MS = 15 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Authenticated, but still throttle brute-forcing of the current password:
    // 10 attempts / 15 min per IP+account, checked before any verification work.
    const email = (session.user.email || '').trim().toLowerCase()
    const limited = tooManyAttempts(`cp:${clientIp(request)}:${email}`, 10, FIFTEEN_MIN_MS, 15)
    if (limited) return limited

    const body = await request.json().catch(() => null)
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword) {
      return NextResponse.json({ success: false, error: 'Enter your current password' }, { status: 400 })
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      )
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { success: false, error: 'New password must be different from your current password' },
        { status: 400 }
      )
    }

    await connectDB()

    const user = await User.findById(session.user.id).select('+passwordHash')
    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    const { default: bcrypt } = await import('bcryptjs')
    const matches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!matches) {
      return NextResponse.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 400 }
      )
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12)
    // Any outstanding reset links become invalid once the password changes.
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()

    return NextResponse.json({
      success: true,
      message: 'Password updated. Use it next time you sign in.',
    })
  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
