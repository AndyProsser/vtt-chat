/**
 * Canonical room name helpers.
 * Single source of truth for identifying well-known room types by name.
 */

/** Returns true if the given room name identifies the campaign greenroom. */
export function isGreenRoomName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ')
  return normalized === 'green room' || normalized === 'green-room'
}
