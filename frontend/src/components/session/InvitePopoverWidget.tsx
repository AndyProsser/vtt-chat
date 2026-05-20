import { useEffect, useRef, useState } from 'react'

type InviteType = 'PLAYER' | 'SPECTATOR'

type InvitePopoverWidgetProps = {
  show: boolean
  joinUrl: string
  spectatorsEnabled: boolean
  watchUrl: string
  onCopyInviteUrl: (inviteType: InviteType) => void
}

type InviteLinkRowProps = {
  label: string
  url: string
  ariaLabel: string
  onCopy: () => void
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
      >
        <span className="material-symbols-outlined" aria-hidden="true">
          content_copy
        </span>
      </button>
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
  }

  return (
    <div className="session-lobby-invite" ref={panelRef}>
      <button
        type="button"
        className="session-icon-action session-lobby-invite__trigger"
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
            onCopy={() => handleCopy('PLAYER')}
          />

          {props.spectatorsEnabled && props.watchUrl ? (
            <InviteLinkRow
              label="Watch"
              url={props.watchUrl}
              ariaLabel="Copy watch invite URL"
              onCopy={() => handleCopy('SPECTATOR')}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
