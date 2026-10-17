import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { clientIp } from '@/lib/rate-limit'
import { tooManyAttempts } from '@/lib/auth-throttle'

const HOUR_MS = 60 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const token = typeof body?.token === 'string' ? body.token.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    // This endpoint is public (no session), so throttle BEFORE any processing:
    // 10/hour per IP, plus 5/hour per IP+email to slow token brute-forcing.
    const ip = clientIp(request)
    const limited = tooManyAttempts(`rp:${ip}`, 10, HOUR_MS, 60) ||
      (email ? tooManyAttempts(`rp:${ip}:${email}`, 5, HOUR_MS, 60) : null)
    if (limited) return limited

    if (!token || !email) {
      return NextResponse.json({ success: false, error: 'Invalid or expired reset link' }, { status: 400 })
    }
    if (!password || password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { success: false, error: 'Password must be between 8 and 128 characters' },
        { status: 400 }
      )
    }

    await connectDB()

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    const user = await User.findOne({
      email,
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires')

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'This reset link is invalid or has expired. Please request a new one.' },
        { status: 400 }
      )
    }

    const { default: bcrypt } = await import('bcryptjs')
    user.passwordHash = await bcrypt.hash(password, 12)
    user.passwordResetToken = undefined
    user.passwordResetExpires = undefined
    await user.save()

    return NextResponse.json({
      success: true,
      message: 'Password updated. You can now sign in with your new password.',
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
