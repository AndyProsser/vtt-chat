import nodemailer from 'nodemailer'
import { logger } from '@/utils/logger'

type PasswordResetEmailParams = {
  toEmail: string
  toName?: string | null
  resetUrl: string
}

function isProductionEnvironment(): boolean {
  return (process.env.NODE_ENV || '').toLowerCase() === 'production'
}

function getMailTransportConfig() {
  const host = String(process.env.SMTP_HOST || '').trim()
  const port = Number(process.env.SMTP_PORT || 587)
  const user = String(process.env.SMTP_USER || '').trim()
  const pass = String(process.env.SMTP_PASS || '').trim()
  const secure = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.SMTP_SECURE || '')
      .trim()
      .toLowerCase()
  )

  if (!host || !user || !pass) {
    return null
  }

  return {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  }
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const transportConfig = getMailTransportConfig()
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || '').trim()
  const fromName = String(process.env.SMTP_FROM_NAME || 'VTT-Chat').trim()

  if (!transportConfig || !fromEmail) {
    if (isProductionEnvironment()) {
      throw new Error('PASSWORD_RESET_EMAIL_NOT_CONFIGURED')
    }

    logger.warn('email', 'Password reset email not sent because SMTP is not configured', {
      toEmail: params.toEmail,
      resetUrl: params.resetUrl,
    })
    return
  }

  const transporter = nodemailer.createTransport(transportConfig)

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: params.toEmail,
    subject: 'Reset your VTT-Chat password',
    text: [
      `Hello ${params.toName || 'there'},`,
      '',
      'We received a request to reset your VTT-Chat password.',
      'Use the link below to choose a new password:',
      params.resetUrl,
      '',
      'If you did not request this reset, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Hello ${params.toName || 'there'},</p>
      <p>We received a request to reset your VTT-Chat password.</p>
      <p><a href="${params.resetUrl}">Choose a new password</a></p>
      <p>If you did not request this reset, you can ignore this email.</p>
    `,
  })
}
