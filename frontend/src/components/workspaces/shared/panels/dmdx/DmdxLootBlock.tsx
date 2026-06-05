import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxStr } from '@/utils/dmdx/dmdxParser'

export function DmdxLootBlock({ parsed, id }: { parsed: DmdxParsed; id?: string }) {
  const items = dmdxArr(parsed, 'items')
  const label = dmdxStr(parsed, 'label', id ? `Loot: ${id}` : 'Loot')

  return (
    <div className="dmdx-block dmdx-block--loot">
      <div className="dmdx-block__header">
        <span className="dmdx-block__type-label">
          <span className="material-symbols-outlined" aria-hidden="true">
            inventory_2
          </span>
          Loot
        </span>
        {label && label !== 'Loot' ? <h4 className="dmdx-block__title">{label}</h4> : null}
      </div>

      {items.length > 0 ? (
        <ul className="dmdx-loot__items">
          {items.map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="dmdx-loot__item">
              <span className="material-symbols-outlined dmdx-loot__item-icon" aria-hidden="true">
                diamond
              </span>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="dmdx-block__empty">No items listed.</p>
      )}
    </div>
  )
}
