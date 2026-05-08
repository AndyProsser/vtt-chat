import { useState } from 'react'
import { RoomType } from '@shared'
import { Icon } from '../ui/Icon'

interface CreateGroupModalProps {
  onClose: () => void
  onCreateGroup: (name: string, type: RoomType) => Promise<void>
}

export function CreateGroupModal({ onClose, onCreateGroup }: CreateGroupModalProps) {
  const [name, setName] = useState('')
  const [type, setType] = useState<RoomType>(RoomType.GROUP)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submitDisabled = isSubmitting || name.trim().length < 2

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 0.45rem)',
    right: 0,
    width: 'min(19rem, calc(100vw - 2rem))',
    border: '1px solid var(--color-border-soft, rgba(148, 163, 184, 0.34))',
    borderRadius: 'var(--radius-lg, 14px)',
    background: 'var(--color-surface, #0f172a)',
    color: 'var(--color-text-primary, #e2e8f0)',
    boxShadow: '0 12px 40px rgba(2, 6, 23, 0.3)',
    padding: '0.9rem',
    display: 'grid',
    gap: '0.8rem',
    zIndex: 1300,
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  const formStyle: React.CSSProperties = {
    display: 'grid',
    gap: '0.7rem',
  }

  const fieldStyle: React.CSSProperties = {
    display: 'grid',
    gap: '0.26rem',
  }

  const segmentStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    width: '100%',
    border: '1px solid var(--color-border-soft, rgba(148, 163, 184, 0.34))',
    borderRadius: 'var(--radius-sm, 8px)',
    overflow: 'hidden',
  }

  const segmentButtonStyle: React.CSSProperties = {
    minHeight: '2rem',
    border: 0,
    borderRight: '1px solid var(--color-border-soft, rgba(148, 163, 184, 0.34))',
    background: 'var(--color-surface, #0f172a)',
    color: 'var(--color-text-secondary, #cbd5e1)',
    padding: '0.45rem 0.5rem',
    fontSize: '0.76rem',
    fontWeight: 600,
    lineHeight: 1,
    textAlign: 'center',
    cursor: 'pointer',
    appearance: 'none',
  }

  const segmentButtonLastStyle: React.CSSProperties = {
    ...segmentButtonStyle,
    borderRight: 0,
  }

  const segmentButtonActiveStyle: React.CSSProperties = {
    background:
      'color-mix(in srgb, var(--color-brand, #3b82f6) 18%, var(--color-surface, #0f172a))',
    color: 'var(--color-text-primary, #e2e8f0)',
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--color-border-soft, rgba(148, 163, 184, 0.34))',
    borderRadius: 'var(--radius-sm, 8px)',
    background:
      'color-mix(in srgb, var(--color-surface-subtle, var(--color-surface, #0f172a)) 74%, var(--color-surface, #0f172a))',
    color: 'var(--color-text-primary, #e2e8f0)',
    padding: '0.45rem 0.55rem',
    font: 'inherit',
  }

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.42rem',
  }

  const actionButtonStyle: React.CSSProperties = {
    border: '1px solid var(--color-border-soft, rgba(148, 163, 184, 0.34))',
    borderRadius: 'var(--radius-sm, 8px)',
    background:
      'color-mix(in srgb, var(--color-surface-subtle, var(--color-surface, #0f172a)) 72%, var(--color-surface, #0f172a))',
    color: 'var(--color-text-primary, #e2e8f0)',
    padding: '0.35rem 0.6rem',
    fontSize: '0.76rem',
    lineHeight: 1,
    cursor: 'pointer',
    appearance: 'none',
  }

  const submitButtonStyle: React.CSSProperties = {
    ...actionButtonStyle,
    borderColor:
      'color-mix(in srgb, var(--color-brand, #3b82f6) 52%, var(--color-border-soft, rgba(148, 163, 184, 0.34)))',
    background: 'color-mix(in srgb, var(--color-brand, #3b82f6) 20%, transparent)',
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextName = name.trim()
    if (nextName.length < 2) {
      setError('Group name must be at least 2 characters.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await onCreateGroup(nextName, type)
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to create group')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="group-popover"
      role="dialog"
      aria-label="Create group"
      data-popover="create-group"
      style={panelStyle}
    >
      <header className="group-popover__header" style={headerStyle}>
        <h5>
          <Icon name="rooms" /> Create Group
        </h5>
        <button type="button" className="group-popover__close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>

      <form className="group-popover__form" style={formStyle} onSubmit={handleSubmit}>
        <label className="group-popover__field" style={fieldStyle}>
          <span>Group name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Scouts"
            maxLength={48}
            autoFocus
            style={inputStyle}
          />
        </label>

        <div className="group-popover__field" style={fieldStyle}>
          <span>Group type</span>
          <div
            className="group-popover__segment"
            style={segmentStyle}
            role="group"
            aria-label="Group type"
          >
            <button
              type="button"
              className={`group-popover__segment-btn ${type === RoomType.GROUP ? 'is-active' : ''}`}
              aria-pressed={type === RoomType.GROUP}
              onClick={() => setType(RoomType.GROUP)}
              disabled={isSubmitting}
              style={
                type === RoomType.GROUP
                  ? { ...segmentButtonStyle, ...segmentButtonActiveStyle }
                  : segmentButtonStyle
              }
            >
              Group
            </button>
            <button
              type="button"
              className={`group-popover__segment-btn ${type === RoomType.PRIVATE ? 'is-active' : ''}`}
              aria-pressed={type === RoomType.PRIVATE}
              onClick={() => setType(RoomType.PRIVATE)}
              disabled={isSubmitting}
              style={
                type === RoomType.PRIVATE
                  ? { ...segmentButtonLastStyle, ...segmentButtonActiveStyle }
                  : segmentButtonLastStyle
              }
            >
              Private
            </button>
          </div>
        </div>

        {error ? <p className="group-popover__error">{error}</p> : null}

        <footer className="group-popover__actions" style={actionsStyle}>
          <button type="button" onClick={onClose} disabled={isSubmitting} style={actionButtonStyle}>
            Cancel
          </button>
          <button type="submit" disabled={submitDisabled} style={submitButtonStyle}>
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </button>
        </footer>
      </form>
    </div>
  )
}
