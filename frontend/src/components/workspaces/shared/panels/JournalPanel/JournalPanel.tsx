/**
 * JournalPanel
 *
 * Unified journal component used in both the editor workspace (browser mode)
 * and the live session workspace (focused mode).
 *
 * Browser mode: pass `sessions`, `selectedSessionId`, `onSessionChange` →
 *   multi-session journal browser with recap status tracking and hashtag filtering.
 *
 * Focused mode: pass `sessionId` (no `sessions`) →
 *   single-session journal editor/viewer rendered directly, browser UI suppressed.
 *
 * Current backing: notes store (legacy NoteEntity shape).
 * Future: dedicated SessionJournal API (GET/PUT /api/journal/:sessionId).
 * See: docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md
 */

import { type Role, type UUID } from '@shared'
import type { JournalSavedPayload } from '@/types/journalPanel'
import type { Session } from '@/types/session'
import '@/styles/components/workspaces/shared/panels/KnowledgePanels.css'
import '@/styles/components/workspaces/shared/panels/MarkdownEditor.css'
import { JournalEditor } from './JournalEditor'
import { JournalBrowser } from './JournalBrowser'

// ---------------------------------------------------------------------------
// JournalPanel — public API
//
// Browser mode (editor workspace):
//   <JournalPanel sessions={sessions} selectedSessionId={id} onSessionChange={fn} ... />
//
// Focused mode (session workspace — single session, no browser chrome):
//   <JournalPanel sessionId={currentSessionId} sessionName={name} ... />
// ---------------------------------------------------------------------------

type JournalPanelFocusedProps = {
  apiUrl: string
  token: string
  campaignId?: UUID
  role: Role
  sessions?: undefined
  sessionId: UUID
  sessionName?: string
  userId?: UUID
  autoEdit?: boolean
  autoSave?: boolean
  hideHeader?: boolean
  onSaved?: (payload: JournalSavedPayload) => void
}

type JournalPanelBrowserProps = {
  apiUrl: string
  token: string
  campaignId?: UUID
  role: Role
  sessions: Session[]
  selectedSessionId: UUID | null
  onSessionChange: (sessionId: UUID) => void
}

export type JournalPanelProps = JournalPanelFocusedProps | JournalPanelBrowserProps

export function JournalPanel(props: JournalPanelProps) {
  if (props.sessions !== undefined) {
    return (
      <JournalBrowser
        apiUrl={props.apiUrl}
        token={props.token}
        campaignId={props.campaignId}
        role={props.role}
        sessions={props.sessions}
        selectedSessionId={props.selectedSessionId}
        onSessionChange={props.onSessionChange}
      />
    )
  }

  return (
    <JournalEditor
      key={`journal-editor:${props.sessionId}`}
      apiUrl={props.apiUrl}
      token={props.token}
      campaignId={props.campaignId}
      role={props.role}
      sessionId={props.sessionId}
      sessionName={props.sessionName}
      userId={props.userId}
      autoEdit={props.autoEdit}
      autoSave={props.autoSave}
      hideHeader={props.hideHeader}
      onSaved={props.onSaved}
    />
  )
}
