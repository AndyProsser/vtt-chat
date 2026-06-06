import { Icon } from '@/components/ui/Icon'

interface HistoryBoundaryRowProps {
  sessionName: string
  startedAtLabel: string
}

export function HistoryBoundaryRow({ sessionName, startedAtLabel }: HistoryBoundaryRowProps) {
  return (
    <div
      className="knowledge-panel-history__boundary"
      aria-label={`Session boundary ${sessionName} ${startedAtLabel}`}
    >
      <div className="knowledge-panel-history__boundary-title-row">
        <span className="knowledge-panel-history__boundary-side-icon">
          <Icon name="keyboard_double_arrow_left" />
        </span>
        <span className="knowledge-panel-history__boundary-text">
          <span className="knowledge-panel-history__boundary-session">{sessionName}</span>
          <span className="knowledge-panel-history__boundary-date">{startedAtLabel}</span>
        </span>
        <span className="knowledge-panel-history__boundary-side-icon">
          <Icon name="keyboard_double_arrow_right" />
        </span>
      </div>
    </div>
  )
}
