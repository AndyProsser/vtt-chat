import { evaluateDiceExpression } from '@/utils/dmdx/dmdxParser'
import { Icon } from '@/components/ui/Icon'

export function DmdxRollBlock({ rawContent }: { rawContent: string }) {
  const expr = rawContent.trim()
  const result = evaluateDiceExpression(expr)

  if (!result) {
    return (
      <div className="dmdx-block dmdx-block--roll dmdx-block--warn">
        <Icon name="casino" />
        <span className="dmdx-block__type-label">Roll</span>
        <span className="dmdx-roll__expr dmdx-roll__expr--invalid">{expr || '?'}</span>
        <span className="dmdx-block__meta">Invalid expression</span>
      </div>
    )
  }

  return (
    <div className="dmdx-block dmdx-block--roll">
      <Icon name="casino" className="dmdx-roll__icon" />
      <div className="dmdx-roll__body">
        <span className="dmdx-block__type-label">Roll</span>
        <span className="dmdx-roll__expr">{result.expression}</span>
      </div>
      <div className="dmdx-roll__results">
        <span className="dmdx-roll__avg" title="Average result">
          ~{result.average}
        </span>
        <span className="dmdx-roll__range">
          ({result.min}–{result.max})
        </span>
      </div>
    </div>
  )
}
