import { useState } from 'react'
import { Alert, Chip } from '@mui/material'
import { SettingsField } from './SettingsField'
import { SettingsSection } from './SettingsSection'
import { requestJson } from '../../utils/api'
import type { RuntimeSettings } from '@/types/settings'

interface Props {
  settings: RuntimeSettings
  onChange: (partial: Partial<RuntimeSettings>) => void
}

type Mode = NonNullable<RuntimeSettings['aiProviderMode']>

const MODE_LABELS: Record<Mode, string> = {
  disabled: 'Disabled — use static tables / hide AI features',
  local: 'Local (Ollama) — model server on this machine',
  remote: 'Remote GPU — model server on another machine',
  cloud: 'Cloud API — OpenAI or Anthropic',
}

export function AiProviderSection({ settings, onChange }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const mode: Mode = settings.aiProviderMode ?? 'disabled'

  const handleTest = async () => {
    setTestBusy(true)
    setTestResult(null)
    try {
      const result = await requestJson<{ ok: boolean; models?: string[] }>(
        '/settings/ai/test',
        { method: 'POST' }
      )
      setTestResult({
        ok: result.ok,
        message: result.ok
          ? `Connected. ${result.models?.length ?? 0} model(s) available.`
          : 'Connection test failed.',
      })
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection test failed.',
      })
    } finally {
      setTestBusy(false)
    }
  }

  return (
    <SettingsSection title="AI Integration">
      <SettingsField label="Provider Mode" htmlFor="aiMode">
        <select
          id="aiMode"
          value={mode}
          onChange={(e) => onChange({ aiProviderMode: e.target.value as Mode })}
        >
          {(Object.keys(MODE_LABELS) as Mode[]).map((k) => (
            <option key={k} value={k}>
              {MODE_LABELS[k]}
            </option>
          ))}
        </select>
      </SettingsField>

      {mode === 'disabled' && (
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 0' }}>
          AI features are off. DM Quick Generate falls back to static D&D 5e tables. Writing
          Assistant is hidden from players.
        </p>
      )}

      {(mode === 'local' || mode === 'remote') && (
        <>
          <SettingsField
            label={mode === 'local' ? 'Base URL' : 'Remote Base URL'}
            htmlFor="aiBaseUrl"
          >
            <input
              id="aiBaseUrl"
              type="text"
              value={settings.aiBaseUrl ?? (mode === 'local' ? 'http://ollama:11434' : '')}
              placeholder={mode === 'local' ? 'http://ollama:11434' : 'http://192.168.1.x:11434'}
              onChange={(e) => onChange({ aiBaseUrl: e.target.value })}
            />
          </SettingsField>

          {mode === 'remote' && (
            <SettingsField
              label={settings.aiApiKeySet ? 'Bearer Token (leave blank to keep existing)' : 'Bearer Token (optional)'}
              htmlFor="aiBearerToken"
            >
              <input
                id="aiBearerToken"
                type="password"
                value={apiKey}
                placeholder={settings.aiApiKeySet ? '••••••••' : 'Optional'}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => { if (apiKey) onChange({ aiApiKeySet: true }) }}
              />
            </SettingsField>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <button
              className="admin-btn admin-btn-ghost"
              disabled={testBusy}
              onClick={() => void handleTest()}
            >
              {testBusy ? 'Testing…' : 'Test Connection'}
            </button>
            {testResult && (
              <Chip
                label={testResult.message}
                color={testResult.ok ? 'success' : 'error'}
                size="small"
              />
            )}
          </div>
        </>
      )}

      {mode === 'cloud' && (
        <>
          <SettingsField label="Provider" htmlFor="aiCloudProvider">
            <select
              id="aiCloudProvider"
              value={settings.aiCloudProvider ?? 'anthropic'}
              onChange={(e) =>
                onChange({
                  aiCloudProvider: e.target.value as NonNullable<RuntimeSettings['aiCloudProvider']>,
                })
              }
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          </SettingsField>

          <SettingsField
            label={settings.aiApiKeySet ? 'API Key (leave blank to keep existing)' : 'API Key'}
            htmlFor="aiApiKey"
          >
            <input
              id="aiApiKey"
              type="password"
              value={apiKey}
              placeholder={settings.aiApiKeySet ? '••••••••' : 'sk-…'}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={() => { if (apiKey) onChange({ aiApiKeySet: true }) }}
            />
          </SettingsField>

          <SettingsField label="Monthly Spend Limit (USD, 0 = unlimited)" htmlFor="aiSpendLimit">
            <input
              id="aiSpendLimit"
              type="number"
              min={0}
              value={settings.aiMonthlySpendLimit ?? 0}
              onChange={(e) =>
                onChange({ aiMonthlySpendLimit: Math.max(0, Number(e.target.value || 0)) })
              }
            />
          </SettingsField>

          <Alert severity="warning" sx={{ mt: 1 }}>
            AI prompts are sent to a third-party cloud provider. Per-campaign consent is required
            before use. DM-private notes and Whisper content are never included in AI context.
          </Alert>
        </>
      )}

      {mode !== 'disabled' && (
        <>
          <SettingsField label="Summary Model" htmlFor="aiSummaryModel">
            <input
              id="aiSummaryModel"
              type="text"
              value={settings.aiSummaryModel ?? ''}
              placeholder={
                mode === 'cloud'
                  ? settings.aiCloudProvider === 'openai'
                    ? 'gpt-4o'
                    : 'claude-opus-4-8'
                  : 'mistral:7b-instruct-q4_K_M'
              }
              onChange={(e) => onChange({ aiSummaryModel: e.target.value })}
            />
          </SettingsField>

          <SettingsField label="Assistant Model (real-time)" htmlFor="aiAssistantModel">
            <input
              id="aiAssistantModel"
              type="text"
              value={settings.aiAssistantModel ?? ''}
              placeholder={
                mode === 'cloud'
                  ? settings.aiCloudProvider === 'openai'
                    ? 'gpt-4o-mini'
                    : 'claude-haiku-4-5-20251001'
                  : 'phi3.5:mini-instruct-q4_K_M'
              }
              onChange={(e) => onChange({ aiAssistantModel: e.target.value })}
            />
          </SettingsField>
        </>
      )}
    </SettingsSection>
  )
}
