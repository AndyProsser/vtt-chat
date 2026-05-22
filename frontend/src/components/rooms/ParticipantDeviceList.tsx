import type { DeviceSessionEntity } from '@shared'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'

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
        <Tooltip key={device.deviceSessionId}>
          <TooltipTrigger asChild>
            <li className="room-selector-profile__device-row">
              <span
                className={`material-symbols-outlined room-selector-profile__device-mic-icon ${device.isActive ? 'is-active' : 'is-muted'}`}
                aria-label={device.isActive ? 'Active mic' : 'Muted'}
              >
                {device.isActive ? 'mic' : 'mic_off'}
              </span>
              <span className="room-selector-profile__device-label">{device.label}</span>
            </li>
          </TooltipTrigger>
          <TooltipContent side="right">
            {device.label} — {device.isActive ? 'Active' : 'Muted'}
          </TooltipContent>
        </Tooltip>
      ))}
    </ul>
  )
}
