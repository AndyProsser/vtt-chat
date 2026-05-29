import { MessageType, Role, SessionState, type UUID } from '@shared'
import { ChatWindow } from '@/components/workspaces/session/chat/ChatWindow'
import { NotesPanel } from '@/components/workspaces/shared/panels/NotesPanel'
import { SpectatorWaitScreen } from '@/components/workspaces/session/SpectatorWaitScreen'
import type { Room as RoomRecord } from '@/types/room'
import type { ComponentProps } from 'react'

type SessionWorkspaceCenterPaneProps = {
  view: 'chat' | 'notes'
  effectiveSessionRole: Role
  currentSessionState: SessionState
  sessionEndedAt?: number
  configuredCooldownDurationMs: number
  selectedRoomId: UUID | ''
  apiUrl: string
  token: string
  currentSessionId: UUID
  selectedRoom: RoomRecord | null
  campaignId: UUID | undefined
  effectiveSessionUser: {
    id: UUID
    username: string
    role: Role
    authType?: 'FULL' | 'GUEST'
  }
  messageGroupingWindowMs: number
  sendWsEvent: ComponentProps<typeof ChatWindow>['sendWsEvent']
  isGreenroomChatMode: boolean
  onPendingNewMessageCountChange?: ComponentProps<
    typeof ChatWindow
  >['onPendingNewMessageCountChange']
}

export function SessionWorkspaceCenterPane(props: SessionWorkspaceCenterPaneProps) {
  return (
    <div
      className="session-command-center-pane"
      data-ui-component="SessionCenterPaneShell"
      data-ui-state={props.view}
    >
      {props.effectiveSessionRole === Role.SPECTATOR &&
      (props.currentSessionState === SessionState.IDLE ||
        props.currentSessionState === SessionState.PAUSED ||
        props.currentSessionState === SessionState.COOLDOWN ||
        props.currentSessionState === SessionState.ENDED ||
        props.currentSessionState === SessionState.CLEANUP) ? (
        <SpectatorWaitScreen
          sessionState={props.currentSessionState}
          sessionEndedAt={props.sessionEndedAt}
          cooldownDurationMs={props.configuredCooldownDurationMs}
        />
      ) : props.view === 'chat' ? (
        <div className="session-live-comms">
          <section className="session-live-comms__chat" aria-label="Chat panel">
            {props.selectedRoomId ? (
              <ChatWindow
                apiUrl={props.apiUrl}
                token={props.token}
                sessionId={props.currentSessionId}
                roomId={props.selectedRoomId}
                campaignId={props.campaignId}
                roomName={props.selectedRoom?.name}
                roomType={props.selectedRoom?.type}
                user={props.effectiveSessionUser}
                messageGroupingWindowMs={props.messageGroupingWindowMs}
                sendWsEvent={props.sendWsEvent}
                forceMessageType={
                  props.isGreenroomChatMode || props.currentSessionState === SessionState.COOLDOWN
                    ? MessageType.OOC
                    : undefined
                }
                onPendingNewMessageCountChange={props.onPendingNewMessageCountChange}
              />
            ) : (
              <div className="session-greenroom-placeholder">
                <h4>Greenroom Chat Standby</h4>
                <p>
                  Start the session to open live chat and stream right-side tools over this
                  workspace.
                </p>
              </div>
            )}
          </section>
        </div>
      ) : props.campaignId ? (
        <NotesPanel
          apiUrl={props.apiUrl}
          token={props.token}
          campaignId={props.campaignId}
          sessionId={props.currentSessionId}
          user={props.effectiveSessionUser}
        />
      ) : null}
    </div>
  )
}
