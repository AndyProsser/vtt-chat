import type { NoteAttachmentEntity, UUID } from '@shared'
import type { ShowToastInput } from '@/state/toastCenter'
import { createNoteAttachmentsFromPicker, NOTE_ATTACHMENT_MAX_COUNT } from '@/utils/noteAttachments'

interface NoteAttachmentsFieldProps {
  campaignId: UUID
  attachments: NoteAttachmentEntity[]
  disabled?: boolean
  onChange: (attachments: NoteAttachmentEntity[]) => void
  showToast: (input: ShowToastInput) => void
}

export function NoteAttachmentsField({
  campaignId,
  attachments,
  disabled = false,
  onChange,
  showToast,
}: NoteAttachmentsFieldProps) {
  const handleAddAttachments = async () => {
    if (disabled) {
      return
    }

    const nextAttachments = await createNoteAttachmentsFromPicker(
      campaignId,
      showToast,
      Math.max(0, NOTE_ATTACHMENT_MAX_COUNT - attachments.length)
    )
    if (nextAttachments.length === 0) {
      return
    }

    onChange([...attachments, ...nextAttachments])
  }

  return (
    <div className="notes-attachments-field">
      <div className="notes-attachments-field__header">
        <label className="notes-edit-label">Attachments</label>
        <button
          type="button"
          onClick={() => void handleAddAttachments()}
          disabled={disabled || attachments.length >= NOTE_ATTACHMENT_MAX_COUNT}
          className="notes-edit-secondary-button"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            attach_file
          </span>
          Add image
        </button>
      </div>

      <p className="notes-attachments-field__hint">
        Up to {NOTE_ATTACHMENT_MAX_COUNT} image attachments are stored with this handout.
      </p>

      {attachments.length ? (
        <div className="notes-attachments-grid">
          {attachments.map((attachment) => (
            <article key={attachment.id} className="notes-attachment-card">
              <a
                href={attachment.uri}
                target="_blank"
                rel="noreferrer"
                className="notes-attachment-card__preview"
              >
                <img src={attachment.uri} alt={attachment.name} loading="lazy" />
              </a>
              <div className="notes-attachment-card__meta">
                <span className="notes-attachment-card__name">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(attachments.filter((entry) => entry.id !== attachment.id))
                  }
                  disabled={disabled}
                  className="notes-edit-icon-button"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  )
}
