import { useState } from 'react'
import { Alert } from '@mui/material'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { requestJson } from '../../utils/api'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function EmailSmtpSection({ settings, onChange }: Props) {
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [smtpPassword, setSmtpPassword] = useState('')

  const handleTest = async () => {
    setTestBusy(true)
    setTestResult(null)
    try {
      await requestJson('/settings/email/test', { method: 'POST' })
      setTestResult({ ok: true, message: 'Test email sent to your admin address.' })
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test email failed.',
      })
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <SettingsSection title="Email — SMTP Configuration">
      <SettingsField label="Host" htmlFor="smtpHost">
        <input
          id="smtpHost"
          type="text"
          value={settings.smtpHost ?? ''}
          placeholder="smtp.example.com"
          onChange={(e) => onChange({ smtpHost: e.target.value })}
        />
      </SettingsField>

      <SettingsField label="Port" htmlFor="smtpPort">
        <input
          id="smtpPort"
          type="number"
          min={1}
          max={65535}
          value={settings.smtpPort ?? 587}
          onChange={(e) => onChange({ smtpPort: Number(e.target.value) })}
        />
      </SettingsField>

      <SettingsField label="Encryption" htmlFor="smtpEncryption">
        <select
          id="smtpEncryption"
          value={settings.smtpEncryption ?? 'starttls'}
          onChange={(e) =>
            onChange({ smtpEncryption: e.target.value as RuntimeSettings['smtpEncryption'] })
          }
        >
          <option value="none">None</option>
          <option value="starttls">STARTTLS (recommended)</option>
          <option value="tls">TLS</option>
        </select>
      </SettingsField>

      <SettingsField label="Username" htmlFor="smtpUser">
        <input
          id="smtpUser"
          type="text"
          value={settings.smtpUser ?? ''}
          onChange={(e) => onChange({ smtpUser: e.target.value })}
        />
      </SettingsField>

      <SettingsField
        label={settings.smtpPasswordSet ? 'Password (leave blank to keep existing)' : 'Password'}
        htmlFor="smtpPassword"
      >
        <input
          id="smtpPassword"
          type="password"
          value={smtpPassword}
          placeholder={settings.smtpPasswordSet ? '••••••••' : ''}
          onChange={(e) => setSmtpPassword(e.target.value)}
          onBlur={() => {
            if (smtpPassword) onChange({ smtpPasswordSet: true })
          }}
        />
      </SettingsField>

      <SettingsField label="From Address" htmlFor="smtpFrom">
        <input
          id="smtpFrom"
          type="email"
          value={settings.smtpFromAddress ?? ''}
          placeholder="no-reply@example.com"
          onChange={(e) => onChange({ smtpFromAddress: e.target.value })}
        />
      </SettingsField>

      <SettingsField label="From Display Name" htmlFor="smtpFromName">
        <input
          id="smtpFromName"
          type="text"
          value={settings.smtpFromName ?? ''}
          placeholder="VTT-Chat"
          onChange={(e) => onChange({ smtpFromName: e.target.value })}
        />
      </SettingsField>

      <SettingsField label="Reply-To (optional)" htmlFor="smtpReplyTo">
        <input
          id="smtpReplyTo"
          type="email"
          value={settings.smtpReplyTo ?? ''}
          onChange={(e) => onChange({ smtpReplyTo: e.target.value })}
        />
      </SettingsField>

      <div style={{ marginTop: 12 }}>
        <button className="admin-btn admin-btn-ghost" disabled={testBusy} onClick={() => void handleTest()}>
          {testBusy ? 'Sending…' : 'Send Test Email'}
        </button>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Sends a test message to your admin account email address.
        </p>
      </div>

      {testResult && (
        <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mt: 1 }}>
          {testResult.message}
        </Alert>
      )}
    </SettingsSection>
  )
}
