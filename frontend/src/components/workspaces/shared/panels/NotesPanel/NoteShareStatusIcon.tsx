import { NoteVisibility, type UUID } from '@shared'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui'
import { getNoteShareStatus } from '../../../../../utils/notesPanel'

interface NoteShareStatusIconProps {
  visibility: NoteVisibility
  allowedUsers: UUID[]
}

export function NoteShareStatusIcon({ visibility, allowedUsers }: NoteShareStatusIconProps) {
  const status = getNoteShareStatus(visibility, allowedUsers)

  return (
    <TooltipProvider delayDuration={140}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`notes-share-status notes-share-status--${status.tone}`}
            aria-label={status.tooltip}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {status.icon}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{status.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
