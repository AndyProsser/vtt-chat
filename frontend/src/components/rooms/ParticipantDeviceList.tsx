import type { DeviceSessionEntity } from '@shared'

interface ParticipantDeviceListProps {
  deviceSessions?: DeviceSessionEntity[]
}

/**
 * Compact icon row rendered below the avatar in the member profile card.
 * Only shown when a user has more than one device connected.
 * Max 2 devices in practice; fits within the 3rem avatar column.
 */
export function ParticipantDeviceList({ deviceSessions }: ParticipantDeviceListProps) {
  if (!deviceSessions || deviceSessions.length <= 1) {
    return null
  }

  return (
    <ul className="room-selector-profile__devices" aria-label="Connected devices">
      {deviceSessions.map((device) => (
        <li
          key={device.deviceSessionId}
          className="room-selector-profile__device-row"
          title={`${device.label} — ${device.isActive ? 'Active' : 'Muted'}`}
        >
          <span
            className={`material-symbols-outlined room-selector-profile__device-mic-icon ${device.isActive ? 'is-active' : 'is-muted'}`}
            aria-label={device.isActive ? 'Active mic' : 'Muted'}
          >
            {device.isActive ? 'mic' : 'mic_off'}
          </span>
          <span className="room-selector-profile__device-label">{device.label}</span>
        </li>
      ))}
    </ul>
  )
}
