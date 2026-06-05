import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxStr } from '@/utils/dmdx/dmdxParser'

const SCHOOL_ICONS: Record<string, string> = {
  abjuration: 'shield',
  conjuration: 'blur_on',
  divination: 'visibility',
  enchantment: 'favorite',
  evocation: 'bolt',
  illusion: 'auto_fix_high',
  necromancy: 'skull',
  transmutation: 'transform',
}

export function DmdxSpellBlock({ parsed }: { parsed: DmdxParsed }) {
  const name = dmdxStr(parsed, 'name', 'Spell')
  const level = dmdxStr(parsed, 'level')
  const school = dmdxStr(parsed, 'school')
  const castingTime = dmdxStr(parsed, 'casting_time')
  const range = dmdxStr(parsed, 'range')
  const components = dmdxStr(parsed, 'components')
  const duration = dmdxStr(parsed, 'duration')
  const description = dmdxStr(parsed, 'description')

  const schoolIcon = school ? (SCHOOL_ICONS[school.toLowerCase()] ?? 'auto_awesome') : null
  const levelLabel =
    level === '0' || level.toLowerCase() === 'cantrip' ? 'Cantrip' : level ? `Level ${level}` : null

  const statRows = [
    castingTime && { label: 'Casting Time', value: castingTime },
    range && { label: 'Range', value: range },
    components && { label: 'Components', value: components },
    duration && { label: 'Duration', value: duration },
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <div className="dmdx-block dmdx-block--spell">
      <div className="dmdx-block__header">
        {schoolIcon ? (
          <span className="material-symbols-outlined dmdx-spell__school-icon" aria-hidden="true">
            {schoolIcon}
          </span>
        ) : null}
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">Spell</span>
          <h4 className="dmdx-block__title">{name}</h4>
          <p className="dmdx-block__meta">{[levelLabel, school].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      {statRows.length > 0 ? (
        <dl className="dmdx-spell__stats">
          {statRows.map(({ label, value }) => (
            <div key={label} className="dmdx-spell__stat-row">
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {description ? (
        <p className="dmdx-block__notes dmdx-spell__description">{description}</p>
      ) : null}
    </div>
  )
}
