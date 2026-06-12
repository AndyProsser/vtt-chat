import type { NoteAttachmentEntity } from '@shared'

interface NoteAttachmentsGalleryProps {
  attachments?: NoteAttachmentEntity[]
}

export function NoteAttachmentsGallery({ attachments = [] }: NoteAttachmentsGalleryProps) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="notes-attachments-gallery">
      <p className="notes-attachments-gallery__label">Attachments</p>
      <div className="notes-attachments-grid">
        {attachments.map((attachment) => (
          <a
            key={attachment.id}
            href={attachment.uri}
            target="_blank"
            rel="noreferrer"
            className="notes-attachment-card notes-attachment-card--readonly"
          >
            <span className="notes-attachment-card__preview">
              <img src={attachment.uri} alt={attachment.name} loading="lazy" />
            </span>
            <span className="notes-attachment-card__name">{attachment.name}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
