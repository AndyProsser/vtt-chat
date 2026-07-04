import nodemailer, { type TransportOptions } from 'nodemailer'
import type { SendEmailPayload } from '@shared/jobs/index'
import { config } from '@/config'
import { logger } from '@/logger'

interface RenderedEmail {
  html: string
  text: string
}

function renderTemplate(templateId: string, vars: Record<string, string>): RenderedEmail {
  switch (templateId) {
    case 'password-reset': {
      const name = vars['toName'] || 'there'
      const resetUrl = vars['resetUrl'] ?? ''
      return {
        text: [
          `Hello ${name},`,
          '',
          'We received a request to reset your VTT-Chat password.',
          'Use the link below to choose a new password:',
          resetUrl,
          '',
          'If you did not request this reset, you can ignore this email.',
        ].join('\n'),
        html: `
          <p>Hello ${name},</p>
          <p>We received a request to reset your VTT-Chat password.</p>
          <p><a href="${resetUrl}">Choose a new password</a></p>
          <p>If you did not request this reset, you can ignore this email.</p>
        `,
      }
    }
    default:
      throw new Error(`Unknown email templateId: ${templateId}`)
  }
}

/**
 * Builds a nodemailer transport config from the SMTP env.
 *
 * Priority:
 *   1. SMTP_SERVICE (well-known service name, e.g. "Gmail") — host/port/secure ignored
 *   2. Manual SMTP_HOST + SMTP_PORT + SMTP_SECURE
 *
 * Returns null when neither is configured (dev skip path).
 */
function buildTransportConfig(): TransportOptions | null {
  const { service, host, user, pass, port, secure } = config.smtp

  if (!user || !pass) return null

  if (service) {
    return { service, auth: { user, pass } } as TransportOptions
  }

  if (host) {
    return { host, port, secure, auth: { user, pass } } as TransportOptions
  }

  return null
}

/**
 * Delivers an email using the SMTP configuration from the queues service env.
 *
 * Config options (in priority order):
 *   - SMTP_SERVICE + SMTP_USER + SMTP_PASS  →  well-known service (e.g. Gmail)
 *   - SMTP_HOST + SMTP_USER + SMTP_PASS     →  manual SMTP server
 *
 * In non-production with no SMTP configured, logs and returns without error.
 * In production, throws if SMTP is not configured.
 */
export async function sendEmail(payload: SendEmailPayload): Promise<void> {
  const transportConfig = buildTransportConfig()
  const { fromEmail, fromName, service } = config.smtp

  if (!transportConfig || !fromEmail) {
    if (config.nodeEnv === 'production') {
      throw new Error(
        'SMTP not configured — cannot send email in production (set SMTP_SERVICE or SMTP_HOST)'
      )
    }
    logger.warn('email-sender', 'SMTP not configured — email skipped (dev mode)', {
      to: payload.to,
      templateId: payload.templateId,
      correlationId: payload.correlationId,
    })
    return
  }

  const { html, text } = renderTemplate(payload.templateId, payload.variables)

  const transporter = nodemailer.createTransport(transportConfig)

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: payload.to,
    subject: payload.subject,
    text,
    html,
  })

  logger.info('email-sender', 'Email sent', {
    to: payload.to,
    templateId: payload.templateId,
    correlationId: payload.correlationId,
    via: service || config.smtp.host,
  })
}
