import { useEffect, useRef, useState } from 'react'

type InviteType = 'PLAYER' | 'SPECTATOR'

type InvitePopoverWidgetProps = {
  show: boolean
  joinCode: string | null
  joinUrl: string
  spectatorsEnabled: boolean
  watchCode: string | null
  watchUrl: string
  onCopyInviteUrl: (inviteType: InviteType) => void
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

  if (!props.show || !props.joinCode) {
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
          <h5 className="session-inline-form-title session-lobby-invite__title">Join and Watch</h5>

          <div className="session-lobby-invite__row">
            <div className="session-lobby-invite__row-heading">
              <strong>Join</strong>
              <span>Code: {props.joinCode}</span>
            </div>
            <div className="session-lobby-invite__row-value">{props.joinUrl}</div>
            <button
              type="button"
              className="session-icon-action session-lobby-invite__copy"
              aria-label="Copy join invite URL"
              onClick={() => handleCopy('PLAYER')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                content_copy
              </span>
            </button>
          </div>

          {props.spectatorsEnabled && props.watchCode ? (
            <div className="session-lobby-invite__row">
              <div className="session-lobby-invite__row-heading">
                <strong>Watch</strong>
                <span>Code: {props.watchCode}</span>
              </div>
              <div className="session-lobby-invite__row-value">{props.watchUrl}</div>
              <button
                type="button"
                className="session-icon-action session-lobby-invite__copy"
                aria-label="Copy watch invite URL"
                onClick={() => handleCopy('SPECTATOR')}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  content_copy
                </span>
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
