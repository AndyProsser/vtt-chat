import type { DmdxParsed } from '@/utils/dmdx/dmdxParser'
import { dmdxStr } from '@/utils/dmdx/dmdxParser'
import { Icon } from '@/components/ui/Icon'

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
        <Icon name="map" className="dmdx-map__icon" />
        <div className="dmdx-block__header-text">
          <span className="dmdx-block__type-label">Map</span>
          <h4 className="dmdx-block__title">{title}</h4>
        </div>
      </div>

      {attachmentToken ? (
        <div className="dmdx-map__image-placeholder">
          <Icon name="image" />
          <span className="dmdx-block__meta">{attachmentToken}</span>
        </div>
      ) : image && !isAttachment ? (
        <div className="dmdx-map__image-placeholder dmdx-block--warn">
          <Icon name="block" />
          <span className="dmdx-block__meta">Blocked: only attachment:// links are allowed</span>
        </div>
      ) : (
        <div className="dmdx-map__image-placeholder">
          <Icon name="add_photo_alternate" />
          <span className="dmdx-block__meta">No image attached</span>
        </div>
      )}
    </div>
  )
}
