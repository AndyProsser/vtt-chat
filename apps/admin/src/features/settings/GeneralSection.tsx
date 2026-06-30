import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

export function GeneralSection({ settings, onChange }: Props) {
  return (
    <SettingsSection title="General">
      <SettingsField label="Site Display Name" htmlFor="siteName">
        <input
          id="siteName"
          type="text"
          value={settings.siteName ?? ''}
          placeholder="VTT-Chat"
          onChange={(e) => onChange({ siteName: e.target.value })}
        />
      </SettingsField>

      <SettingsField label="Primary Region" htmlFor="region">
        <select
          id="region"
          value={settings.primaryRegion}
          onChange={(e) => onChange({ primaryRegion: e.target.value })}
        >
          <option value="us-east-1">us-east-1</option>
          <option value="eu-west-1">eu-west-1</option>
          <option value="ap-southeast-1">ap-southeast-1</option>
        </select>
      </SettingsField>

      <SettingsField label="Admin Session Timeout (hours)" htmlFor="sessionTimeout">
        <input
          id="sessionTimeout"
          type="number"
          min={1}
          max={720}
          value={settings.adminSessionTimeoutHours ?? 24}
          onChange={(e) =>
            onChange({ adminSessionTimeoutHours: Math.max(1, Number(e.target.value || 24)) })
          }
        />
      </SettingsField>

      <SettingsField label="Max Campaigns Per User (0 = unlimited)" htmlFor="maxCampaigns">
        <input
          id="maxCampaigns"
          type="number"
          min={0}
          value={settings.maxCampaignsPerUser ?? 0}
          onChange={(e) =>
            onChange({ maxCampaignsPerUser: Math.max(0, Number(e.target.value || 0)) })
          }
        />
      </SettingsField>
    </SettingsSection>
  )
}
