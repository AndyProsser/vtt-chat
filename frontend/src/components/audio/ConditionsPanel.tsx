export interface ConditionOption {
  id: string
  name: string
  description?: string
}

interface ConditionsPanelProps {
  conditions: ConditionOption[]
  activeConditionIds: string[]
  disabled?: boolean
  onToggleCondition: (conditionId: string) => void
}

export function ConditionsPanel({
  conditions,
  activeConditionIds,
  disabled = false,
  onToggleCondition,
}: ConditionsPanelProps) {
  return (
    <section className="rounded-ui-md border border-ui-border bg-ui-surface p-3">
      <h4 className="m-0 text-sm font-semibold text-ui-primary">Conditions</h4>
      <p className="mt-1 text-xs text-ui-secondary">Toggle session condition overlays.</p>
      <div className="mt-2 grid gap-2">
        {conditions.map((condition) => {
          const active = activeConditionIds.includes(condition.id)
          return (
            <label
              key={condition.id}
              className="flex items-start gap-2 rounded-ui-sm border border-ui-border bg-ui-surface-subtle px-3 py-2"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={active}
                onChange={() => onToggleCondition(condition.id)}
              />
              <span>
                <span className="block text-sm font-semibold text-ui-primary">
                  {condition.name}
                </span>
                {condition.description ? (
                  <span className="block text-xs text-ui-secondary">{condition.description}</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
