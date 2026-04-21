interface SystemToastsProps {
  message?: string
  onDismiss?: () => void
}

export function SystemToasts({ message, onDismiss }: SystemToastsProps) {
  if (!message) {
    return (
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>No active system notices.</p>
    )
  }

  return (
    <div
      role="status"
      style={{
        padding: '0.65rem 0.75rem',
        borderRadius: '6px',
        border: '1px solid #7dd3fc',
        backgroundColor: '#e0f2fe',
        color: '#0c4a6e',
        display: 'flex',
        justifyContent: 'space-between',
        gap: '0.75rem',
        alignItems: 'center',
        fontSize: '0.82rem',
      }}
    >
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#0c4a6e',
            cursor: 'pointer',
            fontWeight: 600,
            padding: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Dismiss
        </button>
      )}
    </div>
  )
}
