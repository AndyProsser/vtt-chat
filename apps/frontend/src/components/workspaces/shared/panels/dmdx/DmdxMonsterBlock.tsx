import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxObj, dmdxStr } from '@/utils/dmdx/dmdxParser'
import { Icon } from '@/components/ui/Icon'

const ABILITY_LABELS: Record<string, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
}

function modifier(score: number): string {
  const mod = Math.floor((score - 10) / 2)
  return mod >= 0 ? `+${mod}` : String(mod)
}

export function DmdxMonsterBlock({ parsed }: { parsed: DmdxParsed }) {
  const name = dmdxStr(parsed, 'name', 'Unknown')
  const size = dmdxStr(parsed, 'size')
  const type = dmdxStr(parsed, 'type')
  const ac = dmdxStr(parsed, 'ac')
  const hp = dmdxStr(parsed, 'hp')
  const speed = dmdxStr(parsed, 'speed')
  const abilities = dmdxObj(parsed, 'abilities')
  const actions = dmdxArr(parsed, 'actions')

  const subtitle = [size, type].filter(Boolean).join(' ')

  return (
    <div className="dmdx-block dmdx-block--monster">
      <div className="dmdx-block__header">
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">
            <Icon name="pets" />
            Monster
          </span>
          <h4 className="dmdx-block__title">{name}</h4>
          {subtitle ? <p className="dmdx-block__meta">{subtitle}</p> : null}
        </div>
      </div>

      <div className="dmdx-monster__stats">
        {ac ? (
          <span className="dmdx-monster__stat">
            <strong>AC</strong> {ac}
          </span>
        ) : null}
        {hp ? (
          <span className="dmdx-monster__stat">
            <strong>HP</strong> {hp}
          </span>
        ) : null}
        {speed ? (
          <span className="dmdx-monster__stat">
            <strong>Speed</strong> {speed}
          </span>
        ) : null}
      </div>

      {Object.keys(abilities).length > 0 ? (
        <div className="dmdx-monster__abilities">
          {Object.keys(ABILITY_LABELS).map((key) => {
            const score = Number(abilities[key])
            if (!abilities[key]) return null
            return (
              <div key={key} className="dmdx-monster__ability">
                <span className="dmdx-monster__ability-label">{ABILITY_LABELS[key]}</span>
                <span className="dmdx-monster__ability-score">{abilities[key]}</span>
                {!Number.isNaN(score) ? (
                  <span className="dmdx-monster__ability-mod">{modifier(score)}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="dmdx-monster__actions">
          <p className="dmdx-block__section-label">Actions</p>
          <ul className="dmdx-monster__action-list">
            {actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
