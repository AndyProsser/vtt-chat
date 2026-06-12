import { WebSocket } from 'ws'
import type { DeviceClass, DeviceSessionEntity, UUID } from '@shared'
import type { ConnectionState } from './state-recovery'

const DEVICE_CLASS_LABELS: Record<DeviceClass, string> = {
  DESKTOP: 'Desktop',
  MOBILE: 'Mobile',
  TABLET: 'Tablet',
}

export interface DeviceSessionSocketLike {
  readyState?: number
  authPayload?: { userId?: string | UUID }
  connectionState?: ConnectionState
  authDeviceSessionId?: string
  authDeviceClass?: DeviceClass
}

function buildDeviceLabel(deviceClass: DeviceClass, index: number): string {
  const baseLabel = DEVICE_CLASS_LABELS[deviceClass] || 'Device'
  return index > 1 ? `${baseLabel} ${index}` : baseLabel
}

export function buildSessionDeviceSessionsByUser(
  sockets: Iterable<DeviceSessionSocketLike>,
  sessionId: UUID
): Record<UUID, DeviceSessionEntity[]> {
  const byUser = new Map<UUID, DeviceSessionSocketLike[]>()

  for (const socket of sockets) {
    if (
      socket.readyState !== WebSocket.OPEN ||
      !socket.authPayload?.userId ||
      socket.connectionState?.sessionId !== sessionId ||
      !socket.authDeviceSessionId ||
      !socket.authDeviceClass
    ) {
      continue
    }

    const userId = socket.authPayload.userId as UUID
    const current = byUser.get(userId) || []
    current.push(socket)
    byUser.set(userId, current)
  }

  const snapshot: Record<UUID, DeviceSessionEntity[]> = {}

  for (const [userId, userSockets] of byUser.entries()) {
    const sortedSockets = [...userSockets].sort(
      (left, right) =>
        (left.connectionState?.connectedAt || 0) - (right.connectionState?.connectedAt || 0)
    )
    const classCounts = new Map<DeviceClass, number>()

    snapshot[userId] = sortedSockets.map((socket, index) => {
      const deviceClass = socket.authDeviceClass as DeviceClass
      const nextCount = (classCounts.get(deviceClass) || 0) + 1
      classCounts.set(deviceClass, nextCount)

      return {
        deviceSessionId: socket.authDeviceSessionId as string,
        deviceClass,
        label: buildDeviceLabel(deviceClass, nextCount),
        connectedAt: socket.connectionState?.connectedAt || 0,
        isActive: index === 0,
        isMuted: index !== 0,
      }
    })
  }

  return snapshot
}
