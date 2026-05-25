import { NoteVisibility, type UUID } from '@shared'
import type { NotesShareUser } from '@/types/notesShare'
import { formatNotesShareUserLabel } from '../../../../../utils/notesPanel'

export function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  return a.every((item, index) => item === b[index])
}

export function areUuidArraysEqual(a: UUID[], b: UUID[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((item, index) => item === sortedB[index])
}

export function toSharedWithLabel(
  visibility: NoteVisibility,
  allowedUsers: UUID[],
  shareUsers: NotesShareUser[]
): string {
  if (visibility === NoteVisibility.DM_ONLY) {
    return 'None'
  }

  if (visibility === NoteVisibility.PLAYERS_VISIBLE) {
    return 'Everyone'
  }

  if (allowedUsers.length === 0) {
    return 'Limited (none selected)'
  }

  return allowedUsers.map((userId) => formatNotesShareUserLabel(userId, shareUsers)).join(', ')
}
