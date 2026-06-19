import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxStr } from '@/utils/dmdx/dmdxParser'
import { Icon } from '@/components/ui/Icon'

const DIFFICULTY_COLORS: Record<string, string> = {
  trivial: 'dmdx-encounter__difficulty--trivial',
  easy: 'dmdx-encounter__difficulty--easy',
  medium: 'dmdx-encounter__difficulty--medium',
  hard: 'dmdx-encounter__difficulty--hard',
  deadly: 'dmdx-encounter__difficulty--deadly',
}

export function DmdxEncounterBlock({ parsed }: { parsed: DmdxParsed }) {
  const name = dmdxStr(parsed, 'name', 'Encounter')
  const difficulty = dmdxStr(parsed, 'difficulty')
  const environment = dmdxStr(parsed, 'environment')
  const creatures = dmdxArr(parsed, 'creatures')
  const objectives = dmdxArr(parsed, 'objectives')
  const lootRef = dmdxStr(parsed, 'loot_ref')
  const mapRef = dmdxStr(parsed, 'map_ref')

  const difficultyClass = difficulty ? (DIFFICULTY_COLORS[difficulty.toLowerCase()] ?? '') : ''

  return (
    <div className="dmdx-block dmdx-block--encounter">
      <div className="dmdx-block__header">
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">
            <Icon name="mystery" />
            Encounter
          </span>
          <h4 className="dmdx-block__title">{name}</h4>
          <div className="dmdx-block__tag-row">
            {difficulty ? (
              <span className={`dmdx-block__tag dmdx-encounter__difficulty ${difficultyClass}`}>
                {difficulty}
              </span>
            ) : null}
            {environment ? <span className="dmdx-block__tag">{environment}</span> : null}
          </div>
        </div>
      </div>

      {creatures.length > 0 ? (
        <div className="dmdx-encounter__section">
          <p className="dmdx-block__section-label">Creatures</p>
          <ul className="dmdx-block__list">
            {creatures.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {objectives.length > 0 ? (
        <div className="dmdx-encounter__section">
          <p className="dmdx-block__section-label">Objectives</p>
          <ul className="dmdx-block__list">
            {objectives.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {lootRef || mapRef ? (
        <div className="dmdx-encounter__refs">
          {lootRef ? (
            <span className="dmdx-block__ref">
              <span className="material-symbols-outlined" aria-hidden="true">
                inventory_2
              </span>
              {lootRef}
            </span>
          ) : null}
          {mapRef ? (
            <span className="dmdx-block__ref">
              <Icon name="map" />
              {mapRef}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
