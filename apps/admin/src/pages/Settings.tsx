import { useState } from 'react'
import { Alert, Box, Button, Divider, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import { GeneralSection } from '../features/settings/GeneralSection'
import { MaintenanceSection } from '../features/settings/MaintenanceSection'
import { FullFeatureFlagsSection } from '../features/settings/FullFeatureFlagsSection'
import { EmailSmtpSection } from '../features/settings/EmailSmtpSection'
import { AiProviderSection } from '../features/settings/AiProviderSection'
import { BackupSection } from '../features/settings/BackupSection'
import { JobQueuesSection } from '../features/settings/JobQueuesSection'
import { StorageSection } from '../features/settings/StorageSection'
import { LogSinkPoliciesSection } from '../features/settings/LogSinkPoliciesSection'
import { ExternalSystemsSection } from '../features/settings/ExternalSystemsSection'
import { useRuntimeSettings } from '../features/settings/useRuntimeSettings'
import type { RuntimeSettings } from '@/types/settings'
import '../styles/Settings.css'

type SubSection =
  | 'general'
  | 'feature-flags'
  | 'maintenance'
  | 'email-smtp'
  | 'ai-provider'
  | 'backup'
  | 'job-queues'
  | 'storage'
  | 'external-systems'

interface NavGroup {
  label: string
  items: Array<{ key: SubSection; label: string }>
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'System',
    items: [
      { key: 'general', label: 'General' },
      { key: 'feature-flags', label: 'Feature Flags' },
      { key: 'maintenance', label: 'Maintenance' },
    ],
  },
  {
    label: 'Email',
    items: [{ key: 'email-smtp', label: 'SMTP Configuration' }],
  },
  {
    label: 'AI Integration',
    items: [{ key: 'ai-provider', label: 'Provider' }],
  },
  {
    label: 'Backup & Jobs',
    items: [
      { key: 'backup', label: 'Backup Schedule' },
      { key: 'job-queues', label: 'Queue Inspector' },
    ],
  },
  {
    label: 'Data',
    items: [{ key: 'storage', label: 'Retention Policies' }],
  },
  {
    label: 'Integrations',
    items: [{ key: 'external-systems', label: 'External Systems' }],
  },
]

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SubSection>('general')

  const {
    settings,
    setSettings,
    loading,
    saving,
    backupBusy,
    error,
    statusMessage,
    updateSettings,
    triggerBackup,
  } = useRuntimeSettings()

  const handleChange = (partial: Partial<RuntimeSettings>) => {
    setSettings((current) => (current ? { ...current, ...partial } : current))
  }

  const renderSection = () => {
    if (!settings) return null
    switch (activeSection) {
      case 'general':
        return <GeneralSection settings={settings} onChange={handleChange} />
      case 'feature-flags':
        return <FullFeatureFlagsSection settings={settings} onChange={handleChange} />
      case 'maintenance':
        return <MaintenanceSection settings={settings} onChange={handleChange} />
      case 'email-smtp':
        return <EmailSmtpSection settings={settings} onChange={handleChange} />
      case 'ai-provider':
        return <AiProviderSection settings={settings} onChange={handleChange} />
      case 'backup':
        return (
          <BackupSection
            settings={settings}
            onChange={handleChange}
            onBackupNow={() => void triggerBackup()}
            backupBusy={backupBusy}
          />
        )
      case 'job-queues':
        return <JobQueuesSection />
      case 'storage':
        return (
          <>
            <StorageSection settings={settings} onChange={handleChange} />
            <LogSinkPoliciesSection settings={settings} onChange={handleChange} />
          </>
        )
      case 'external-systems':
        return <ExternalSystemsSection />
    }
  }

  const needsSave = activeSection !== 'job-queues' && activeSection !== 'external-systems'

  return (
    <Box component="section" sx={{ display: 'grid', gap: 0 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Settings
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The Tome — system configuration and operational controls
        </Typography>
      </Box>

      {loading && <Alert severity="info" sx={{ mb: 2 }}>Loading settings…</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {statusMessage && <Alert severity="success" sx={{ mb: 2 }}>{statusMessage}</Alert>}

      <Box sx={{ display: 'flex', gap: 0, minHeight: 600 }}>
        {/* Sub-nav sidebar */}
        <Box
          sx={{
            width: 200,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            pr: 0,
          }}
        >
          {NAV_GROUPS.map((group) => (
            <Box key={group.label} sx={{ mb: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ px: 2, py: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {group.label}
              </Typography>
              <List dense disablePadding>
                {group.items.map((item) => (
                  <ListItemButton
                    key={item.key}
                    selected={activeSection === item.key}
                    onClick={() => setActiveSection(item.key)}
                    sx={{ pl: 2, borderRadius: '0 8px 8px 0', mr: 1 }}
                  >
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Box>
          ))}
        </Box>

        {/* Section content */}
        <Box sx={{ flex: 1, pl: 3, display: 'grid', alignContent: 'start', gap: 2 }}>
          {renderSection()}

          {needsSave && settings && (
            <>
              <Divider />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="contained"
                  disabled={saving || loading}
                  onClick={() => void updateSettings()}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Last updated: {new Date(settings.updatedAt).toLocaleString()}
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
