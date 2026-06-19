export type RouteView =
  | { kind: 'app' }
  | { kind: 'join'; inviteCode: string; initialEmail?: string }
  | { kind: 'watch'; inviteCode: string }
  | { kind: 'browse' }
  | { kind: 'popout-note'; noteId: string }
  | { kind: 'popout-journal'; sessionId: string }
  | { kind: 'ext-launch'; campaignId: string; sessionId: string; token?: string; hint?: string }

export function resolveRoute(pathname: string, search?: string): RouteView {
  if (pathname === '/ext-launch') {
    const params = new URLSearchParams(search ?? '')
    const campaignId = params.get('campaignId')?.trim() ?? ''
    const sessionId = params.get('sessionId')?.trim() ?? ''
    const token = params.get('token')?.trim() || undefined
    const hint = params.get('hint')?.trim() || undefined
    return { kind: 'ext-launch', campaignId, sessionId, token, hint }
  }

  const joinMatch = pathname.match(/^\/join\/([^/]+)$/)
  if (joinMatch) {
    const params = new URLSearchParams(search ?? '')
    const rawEmail = params.get('email')?.trim()
    return {
      kind: 'join',
      inviteCode: decodeURIComponent(joinMatch[1] || '').trim(),
      ...(rawEmail ? { initialEmail: rawEmail } : {}),
    }
  }

  const watchMatch = pathname.match(/^\/watch\/([^/]+)$/)
  if (watchMatch) {
    return {
      kind: 'watch',
      inviteCode: decodeURIComponent(watchMatch[1] || '').trim(),
    }
  }

  if (pathname === '/browse') {
    return { kind: 'browse' }
  }

  const popoutNoteMatch = pathname.match(/^\/popout\/note\/([^/]+)$/)
  if (popoutNoteMatch) {
    return { kind: 'popout-note', noteId: decodeURIComponent(popoutNoteMatch[1] || '') }
  }

  const popoutJournalMatch = pathname.match(/^\/popout\/journal\/([^/]+)$/)
  if (popoutJournalMatch) {
    return { kind: 'popout-journal', sessionId: decodeURIComponent(popoutJournalMatch[1] || '') }
  }

  return { kind: 'app' }
}

/** sessionStorage keys used by pop-out windows (same-origin, readable in new window). */
export const POPOUT_STORAGE_TOKEN_KEY = 'vtt-popout:token'
export const POPOUT_STORAGE_API_URL_KEY = 'vtt-popout:api-url'

/** Opens a note in a dedicated pop-out window. */
export function openNotePopout(noteId: string, token: string, apiUrl: string): void {
  sessionStorage.setItem(POPOUT_STORAGE_TOKEN_KEY, token)
  sessionStorage.setItem(POPOUT_STORAGE_API_URL_KEY, apiUrl)
  window.open(
    `/popout/note/${noteId}`,
    `vtt-popout-note-${noteId}`,
    'width=780,height=680,resizable=yes,menubar=no,toolbar=no,location=no,status=no'
  )
}

/** Opens a journal in a dedicated pop-out window. */
export function openJournalPopout(sessionId: string, token: string, apiUrl: string): void {
  sessionStorage.setItem(POPOUT_STORAGE_TOKEN_KEY, token)
  sessionStorage.setItem(POPOUT_STORAGE_API_URL_KEY, apiUrl)
  window.open(
    `/popout/journal/${sessionId}`,
    `vtt-popout-journal-${sessionId}`,
    'width=780,height=680,resizable=yes,menubar=no,toolbar=no,location=no,status=no'
  )
}
