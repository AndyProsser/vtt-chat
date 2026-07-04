import {
  EXTENSION_CONFLICT_RESOLUTION_OPTIONS,
  EXTENSION_PARTY_ACCESS_OPTIONS,
  getExtensionConflictResolutionLabel,
  getExtensionPartyAccessLabel,
} from '@/constants/sessionUi.constants'
import type {
  ExtensionPartyInventorySyncAccess,
  ExtensionSyncConflictResolution,
} from '@/types/sessionUi'

/**
 * Renders the four inventory-sync sub-controls shown inside the Extension card
 * when extensionSyncPolicy is not NONE:
 *   – Inventory sync ON/OFF
 *   – Currency sync ON/OFF
 *   – Party inventory access (All players / DM only / Disabled)
 *   – Conflict resolution (Overwrite / Ignore / Review)
 *
 * Extracted into its own file to keep Policy.tsx within the 400-line limit.
 */

type ToggleButtonProps = {
  label: string
  id: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
}

function SyncTogglePair({ label, id, value, onChange, disabled }: ToggleButtonProps) {
  return (
    <>
      <label className="session-label" id={`label-${id}`}>
        {label}
      </label>
      <div className="session-toggle-group" role="group" aria-labelledby={`label-${id}`}>
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`session-toggle-button ${value === v ? 'is-active' : ''}`}
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            disabled={disabled}
          >
            {v ? 'ON' : 'OFF'}
          </button>
        ))}
      </div>
    </>
  )
}

type ExtensionInventorySyncProps = {
  settingsExtensionInventorySyncEnabled: boolean
  onSettingsExtensionInventorySyncEnabledChange: (value: boolean) => void
  settingsExtensionCurrencySyncEnabled: boolean
  onSettingsExtensionCurrencySyncEnabledChange: (value: boolean) => void
  settingsExtensionPartyInventorySyncAccess: ExtensionPartyInventorySyncAccess
  onSettingsExtensionPartyInventorySyncAccessChange: (
    value: ExtensionPartyInventorySyncAccess
  ) => void
  settingsExtensionSyncConflictResolution: ExtensionSyncConflictResolution
  onSettingsExtensionSyncConflictResolutionChange: (value: ExtensionSyncConflictResolution) => void
  disabled: boolean
}

/** Sub-section rendered inside the Extension settings card when sync is not disabled. */
export function ExtensionInventorySync(props: ExtensionInventorySyncProps) {
  return (
    <>
      <SyncTogglePair
        label="Inventory sync"
        id="inventory-sync"
        value={props.settingsExtensionInventorySyncEnabled}
        onChange={props.onSettingsExtensionInventorySyncEnabledChange}
        disabled={props.disabled}
      />

      <SyncTogglePair
        label="Currency sync"
        id="currency-sync"
        value={props.settingsExtensionCurrencySyncEnabled}
        onChange={props.onSettingsExtensionCurrencySyncEnabledChange}
        disabled={props.disabled}
      />

      <label className="session-label" id="label-party-inventory-access">
        Party inventory access
      </label>
      <div
        className="session-toggle-group"
        role="group"
        aria-labelledby="label-party-inventory-access"
      >
        {EXTENSION_PARTY_ACCESS_OPTIONS.map((access: ExtensionPartyInventorySyncAccess) => (
          <button
            key={access}
            type="button"
            className={`session-toggle-button ${props.settingsExtensionPartyInventorySyncAccess === access ? 'is-active' : ''}`}
            aria-pressed={props.settingsExtensionPartyInventorySyncAccess === access}
            onClick={() => props.onSettingsExtensionPartyInventorySyncAccessChange(access)}
            disabled={props.disabled}
          >
            {getExtensionPartyAccessLabel(access)}
          </button>
        ))}
      </div>

      <label className="session-label" id="label-sync-conflict-resolution">
        Conflict resolution
      </label>
      <div
        className="session-toggle-group"
        role="group"
        aria-labelledby="label-sync-conflict-resolution"
      >
        {EXTENSION_CONFLICT_RESOLUTION_OPTIONS.map(
          (resolution: ExtensionSyncConflictResolution) => (
            <button
              key={resolution}
              type="button"
              className={`session-toggle-button ${props.settingsExtensionSyncConflictResolution === resolution ? 'is-active' : ''}`}
              aria-pressed={props.settingsExtensionSyncConflictResolution === resolution}
              onClick={() => props.onSettingsExtensionSyncConflictResolutionChange(resolution)}
              disabled={props.disabled}
            >
              {getExtensionConflictResolutionLabel(resolution)}
            </button>
          )
        )}
      </div>
    </>
  )
}
