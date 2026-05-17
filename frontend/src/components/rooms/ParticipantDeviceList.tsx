import type { DeviceSessionEntity } from '@shared'

interface ParticipantDeviceListProps {
  deviceSessions?: DeviceSessionEntity[]
}

export function ParticipantDeviceList({ deviceSessions }: ParticipantDeviceListProps) {
  if (!deviceSessions || deviceSessions.length <= 1) {
    return null
  }

  return (
    <div className="room-selector-profile__devices" aria-label="Connected devices">
      <span className="room-selector-profile__devices-title">Devices</span>
      <ul className="room-selector-profile__devices-list">
        {deviceSessions.map((device) => (
          <li key={device.deviceSessionId} className="room-selector-profile__devices-item">
            <span
              className={`room-selector-profile__devices-status ${
                device.isActive
                  ? 'room-selector-profile__devices-status--active'
                  : 'room-selector-profile__devices-status--muted'
              }`}
            >
              {device.isActive ? 'Active' : 'Muted'}
            </span>
            <span className="room-selector-profile__devices-label">{device.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
