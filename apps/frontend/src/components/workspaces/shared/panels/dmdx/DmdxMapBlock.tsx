import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxStr } from '@/utils/dmdx/dmdxParser'

export function DmdxMapBlock({ parsed, id }: { parsed: DmdxParsed; id?: string }) {
  const title = dmdxStr(parsed, 'title', id || 'Map')
  const image = dmdxStr(parsed, 'image')

  // Only attachment:// tokens are allowed in persisted payloads.
  // base64 data URIs and http(s) are blocked here.
  const isAttachment = image.startsWith('attachment://')
  const attachmentToken = isAttachment ? image.slice('attachment://'.length) : null

  return (
    <div className="dmdx-block dmdx-block--map">
      <div className="dmdx-block__header">
        <span className="material-symbols-outlined dmdx-map__icon" aria-hidden="true">
          map
        </span>
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">Map</span>
          <h4 className="dmdx-block__title">{title}</h4>
        </div>
      </div>

      {attachmentToken ? (
        <div className="dmdx-map__image-placeholder">
          <span className="material-symbols-outlined" aria-hidden="true">
            image
          </span>
          <span className="dmdx-block__meta">{attachmentToken}</span>
        </div>
      ) : image && !isAttachment ? (
        <div className="dmdx-map__image-placeholder dmdx-block--warn">
          <span className="material-symbols-outlined" aria-hidden="true">
            block
          </span>
          <span className="dmdx-block__meta">Blocked: only attachment:// links are allowed</span>
        </div>
      ) : (
        <div className="dmdx-map__image-placeholder">
          <span className="material-symbols-outlined" aria-hidden="true">
            add_photo_alternate
          </span>
          <span className="dmdx-block__meta">No image attached</span>
        </div>
      )}
    </div>
  )
}
