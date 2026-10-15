import nodemailer from 'nodemailer'

type MailOptions = {
  to: string
  subject: string
  html: string
  text: string
}

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD } = process.env

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: SMTP_SECURE === 'true',
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  })
}

export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)
}

export async function sendEmail({ to, subject, html, text }: MailOptions): Promise<boolean> {
  const transport = getTransport()
  if (!transport) {
    console.warn('SMTP is not configured — skipping email send.')
    return false
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      text,
    })
    return true
  } catch (error) {
    console.error('Failed to send email:', error)
    return false
  }
}

export function renderPasswordResetEmail(resetUrl: string, name: string): { html: string; text: string } {
  const html = `
  <div style="font-family:'DM Sans',Arial,sans-serif;background:#f8f7fb;padding:34px 20px;color:#201c33">
    <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #eceaf3;border-radius:16px;overflow:hidden">
      <div style="padding:26px 28px 0;display:flex;align-items:center;gap:10px">
        <span style="width:36px;height:36px;border-radius:12px;display:grid;place-items:center;color:#fff;background:linear-gradient(145deg,#987df6,#6e53e5);font-weight:800">R</span>
        <b style="font-family:Manrope,Arial,sans-serif;font-size:17px;letter-spacing:-.5px">ricoz <span style="font-weight:500;color:#8e8aa0">inventory</span></b>
      </div>
      <div style="padding:22px 28px 28px">
        <p style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:#8069dc;margin:0 0 12px">PASSWORD RESET</p>
        <h1 style="font-family:Manrope,Arial,sans-serif;font-size:22px;letter-spacing:-.8px;margin:0 0 10px">Hi ${name || 'there'},</h1>
        <p style="font-size:13px;line-height:1.8;color:#77758a;margin:0 0 20px">
          We received a request to reset your Ricoz Inventory password. This link expires in 1 hour.
          If you didn&apos;t request this, you can safely ignore this email.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#8066ed,#6b50df);color:#fff;text-decoration:none;font-weight:700;font-size:13px;border-radius:10px;padding:13px 18px">
          Reset password
        </a>
        <p style="font-size:10px;color:#aaa5b5;line-height:1.7;margin:22px 0 0">
          If the button doesn&apos;t work, copy this link into your browser:<br/>
          <span style="color:#7358e8;word-break:break-all">${resetUrl}</span>
        </p>
      </div>
    </div>
    <p style="text-align:center;font-size:9px;color:#aaa5b5;margin-top:16px">© 2026 Ricoz Inventory · Inventory operations, made clearer.</p>
  </div>`

  const text = `Reset your Ricoz Inventory password.\n\n${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`

  return { html, text }
}
