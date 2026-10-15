import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectDB } from '@/lib/db/mongodb'
import { User } from '@/models/User'
import { sendEmail, renderPasswordResetEmail, isSmtpConfigured } from '@/lib/email'

function appUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'A valid email address is required' }, { status: 400 })
    }

    await connectDB()

    const user = await User.findOne({ email, isActive: true })

    // Always return the same response to avoid revealing which emails exist
    const okResponse = NextResponse.json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    })

    if (!user) return okResponse

    if (!isSmtpConfigured()) {
      console.warn('Password reset requested but SMTP is not configured.')
      return okResponse
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')

    user.passwordResetToken = hashedToken
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await user.save({ validateBeforeSave: false })

    const resetUrl = `${appUrl()}/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`
    const { html, text } = renderPasswordResetEmail(resetUrl, user.name)

    const sent = await sendEmail({
      to: user.email,
      subject: 'Reset your Ricoz Inventory password',
      html,
      text,
    })

    if (!sent) {
      // roll back token so a broken mailer can't leave a dangling reset
      user.passwordResetToken = undefined
      user.passwordResetExpires = undefined
      await user.save({ validateBeforeSave: false })
      return NextResponse.json(
        { success: false, error: 'Unable to send the reset email right now. Please try again later.' },
        { status: 502 }
      )
    }

    return okResponse
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
export const dynamic = 'force-dynamic'
