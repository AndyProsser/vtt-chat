import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxArr, dmdxStr } from '@/utils/dmdx/dmdxParser'

export function DmdxNpcBlock({ parsed }: { parsed: DmdxParsed }) {
  const name = dmdxStr(parsed, 'name', 'Unknown NPC')
  const race = dmdxStr(parsed, 'race')
  const cls = dmdxStr(parsed, 'class')
  const level = dmdxStr(parsed, 'level')
  const alignment = dmdxStr(parsed, 'alignment')
  const tags = dmdxArr(parsed, 'tags')
  const portrait = dmdxStr(parsed, 'portrait')
  const notes = dmdxStr(parsed, 'notes')

  const meta = [race, cls && level ? `${cls} ${level}` : cls || level, alignment]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="dmdx-block dmdx-block--npc">
      <div className="dmdx-block__header">
        {portrait && portrait.startsWith('attachment://') ? (
          <div className="dmdx-npc__portrait-placeholder" aria-hidden="true">
            <span className="material-symbols-outlined">person</span>
          </div>
        ) : null}
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">NPC</span>
          <h4 className="dmdx-block__title">{name}</h4>
          {meta ? <p className="dmdx-block__meta">{meta}</p> : null}
        </div>
      </div>

      {tags.length > 0 ? (
        <div className="dmdx-block__tags">
          {tags.map((tag) => (
            <span key={tag} className="dmdx-block__tag">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {notes ? <p className="dmdx-block__notes">{notes}</p> : null}
    </div>
  )
}
