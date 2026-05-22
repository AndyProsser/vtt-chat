import { useEffect, useRef, useState } from 'react'

type InviteType = 'PLAYER' | 'SPECTATOR'

type InvitePopoverWidgetProps = {
  show: boolean
  joinUrl: string
  spectatorsEnabled: boolean
  watchUrl: string
  canRefreshInvites?: boolean
  onCopyInviteUrl: (inviteType: InviteType) => void
  onReissueInvite: (inviteType: InviteType) => void
  isInviteReissuing?: boolean
  onClosePopover?: () => void
}

type InviteLinkRowProps = {
  label: string
  url: string
  ariaLabel: string
  refreshAriaLabel: string
  canCopy?: boolean
  canRefresh?: boolean
  showRefresh?: boolean
  onCopy: () => void
  onRefresh: () => void
}

function InviteLinkRow(props: InviteLinkRowProps) {
  return (
    <div className="session-lobby-invite__row">
      <strong className="session-lobby-invite__row-label">{props.label}</strong>
      <div className="session-lobby-invite__row-value">{props.url}</div>
      <button
        type="button"
        className="session-icon-action session-lobby-invite__copy"
        aria-label={props.ariaLabel}
        onClick={props.onCopy}
        disabled={props.canCopy === false}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          content_copy
        </span>
      </button>
      {props.showRefresh ? (
        <button
          type="button"
          className="session-icon-action session-lobby-invite__refresh"
          aria-label={props.refreshAriaLabel}
          onClick={props.onRefresh}
          disabled={props.canRefresh === false}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        </button>
      ) : null}
    </div>
  )
}

export function InvitePopoverWidget(props: InvitePopoverWidgetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen])

  if (!props.show || !props.joinUrl) {
    return null
  }

  const handleCopy = (inviteType: InviteType) => {
    props.onCopyInviteUrl(inviteType)
    setIsOpen(false)
    if (props.onClosePopover) {
      props.onClosePopover()
    }
  }

  const handleRefresh = (inviteType: InviteType) => {
    props.onReissueInvite(inviteType)
  }

  return (
    <div className="session-lobby-invite" ref={panelRef}>
      <button
        type="button"
        className="session-toolbar__icon-btn session-lobby-invite__trigger"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          person_add
        </span>
        <span>Invite</span>
      </button>

      {isOpen ? (
        <section
          className="session-lobby-invite__panel"
          role="dialog"
          aria-label="Campaign invite links"
        >
          <InviteLinkRow
            label="Join"
            url={props.joinUrl}
            ariaLabel="Copy join invite URL"
            refreshAriaLabel="Refresh join invite URL"
            showRefresh={props.canRefreshInvites === true}
            canRefresh={!props.isInviteReissuing}
            onCopy={() => handleCopy('PLAYER')}
            onRefresh={() => handleRefresh('PLAYER')}
          />

          {props.spectatorsEnabled ? (
            <InviteLinkRow
              label="Watch"
              url={props.watchUrl || 'Watch link unavailable'}
              ariaLabel={props.watchUrl ? 'Copy watch invite URL' : 'Watch invite URL unavailable'}
              refreshAriaLabel="Refresh watch invite URL"
              showRefresh={props.canRefreshInvites === true}
              canCopy={Boolean(props.watchUrl)}
              canRefresh={!props.isInviteReissuing}
              onCopy={() => handleCopy('SPECTATOR')}
              onRefresh={() => handleRefresh('SPECTATOR')}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
