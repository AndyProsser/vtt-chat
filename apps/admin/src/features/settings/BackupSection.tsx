import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
  onBackupNow: () => void
  backupBusy: boolean
}

function cronPreview(expr: string): string {
  if (!expr.trim()) return 'No schedule set'
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour] = parts
  const dayPart = parts[4]
  if (dayPart === '*' && parts[2] === '*') {
    const h = Number(hour)
    const m = Number(min)
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      const label = `Every day at ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      return label
    }
  }
  return expr
}

export function BackupSection({ settings, onChange, onBackupNow, backupBusy }: Props) {
  const target = settings.backupTarget ?? 'local'
  const schedule = settings.backupSchedule ?? settings.backupWindow ?? ''

  return (
    <SettingsSection title="Backup & Recovery">
      <SettingsField label="Backup Target" htmlFor="backupTarget">
        <select
          id="backupTarget"
          value={target}
          onChange={(e) =>
            onChange({ backupTarget: e.target.value as RuntimeSettings['backupTarget'] })
          }
        >
          <option value="local">Local filesystem</option>
          <option value="s3">S3-compatible object storage</option>
        </select>
      </SettingsField>

      {target === 'local' && (
        <SettingsField label="Local Directory Path" htmlFor="backupLocalPath">
          <input
            id="backupLocalPath"
            type="text"
            value={settings.backupLocalPath ?? ''}
            placeholder="/var/backups/vtt-chat"
            onChange={(e) => onChange({ backupLocalPath: e.target.value })}
          />
        </SettingsField>
      )}

      {target === 's3' && (
        <>
          <SettingsField label="Bucket Name" htmlFor="backupS3Bucket">
            <input
              id="backupS3Bucket"
              type="text"
              value={settings.backupS3Bucket ?? ''}
              onChange={(e) => onChange({ backupS3Bucket: e.target.value })}
            />
          </SettingsField>
          <SettingsField label="Endpoint URL (leave blank for AWS)" htmlFor="backupS3Endpoint">
            <input
              id="backupS3Endpoint"
              type="text"
              value={settings.backupS3Endpoint ?? ''}
              placeholder="https://s3.eu-west-1.amazonaws.com"
              onChange={(e) => onChange({ backupS3Endpoint: e.target.value })}
            />
          </SettingsField>
          <SettingsField label="Access Key" htmlFor="backupS3AccessKey">
            <input
              id="backupS3AccessKey"
              type="text"
              value={settings.backupS3AccessKey ?? ''}
              onChange={(e) => onChange({ backupS3AccessKey: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            label={
              settings.backupS3SecretKeySet
                ? 'Secret Key (leave blank to keep existing)'
                : 'Secret Key'
            }
            htmlFor="backupS3Secret"
          >
            <input
              id="backupS3Secret"
              type="password"
              placeholder={settings.backupS3SecretKeySet ? '••••••••' : ''}
              onChange={(e) => {
                if (e.target.value) onChange({ backupS3SecretKeySet: true })
              }}
            />
          </SettingsField>
          <SettingsField label="Path Prefix (optional)" htmlFor="backupS3Prefix">
            <input
              id="backupS3Prefix"
              type="text"
              value={settings.backupS3Prefix ?? ''}
              placeholder="vtt-chat/backups/"
              onChange={(e) => onChange({ backupS3Prefix: e.target.value })}
            />
          </SettingsField>
        </>
      )}

      <SettingsField label="Schedule (cron expression)" htmlFor="backupSchedule">
        <input
          id="backupSchedule"
          type="text"
          value={schedule}
          placeholder="0 2 * * *"
          onChange={(e) => onChange({ backupSchedule: e.target.value })}
        />
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          {cronPreview(schedule)}
        </p>
      </SettingsField>

      <SettingsField label="Retention (keep last N backups)" htmlFor="backupRetention">
        <input
          id="backupRetention"
          type="number"
          min={1}
          value={settings.backupRetentionCount ?? 7}
          onChange={(e) =>
            onChange({ backupRetentionCount: Math.max(1, Number(e.target.value || 7)) })
          }
        />
      </SettingsField>

      <div style={{ marginTop: 12 }}>
        <button
          className="admin-btn"
          disabled={backupBusy}
          onClick={onBackupNow}
        >
          {backupBusy ? 'Queuing Backup…' : 'Backup Now'}
        </button>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
          Triggers an immediate backup job. Progress visible in Job Queues.
        </p>
      </div>
    </SettingsSection>
  )
}
