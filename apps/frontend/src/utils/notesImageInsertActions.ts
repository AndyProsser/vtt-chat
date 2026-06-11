import type { MarkdownEditorInsertAction } from '@/components/workspaces/shared/panels/MarkdownEditor'
import { pickNoteImageFiles, prepareNoteImage } from '@/utils/noteAttachments'
import type { ShowToastInput } from '@/state/toastCenter'

type ShowToast = (input: ShowToastInput) => void

function escapeMarkdownAltText(value: string): string {
  return value.replace(/[\\[\]]/g, '\\$&')
}

function toMarkdownImage(url: string, altText: string): string {
  const safeAlt = escapeMarkdownAltText(altText.trim() || 'Handout image')
  return `![${safeAlt}](${url})`
}

async function uploadImageMarkdown(showToast: ShowToast): Promise<string> {
  const file = (await pickNoteImageFiles(false))[0] || null
  if (!file) {
    return ''
  }

  const prepared = await prepareNoteImage(file, showToast)
  if (!prepared) {
    return ''
  }

  return toMarkdownImage(prepared.dataUrl, prepared.name)
}

function insertImageFromUrl(showToast: ShowToast): string {
  const imageUrl = window.prompt('Paste image URL for this handout:')?.trim()
  if (!imageUrl) {
    return ''
  }

  const isSupportedUrl =
    imageUrl.startsWith('http://') ||
    imageUrl.startsWith('https://') ||
    imageUrl.startsWith('data:image/')

  if (!isSupportedUrl) {
    showToast({
      variant: 'error',
      message: 'Use an http(s) URL or data:image URL for handout images.',
    })
    return ''
  }

  const altText = window.prompt('Image description (optional):')?.trim() || 'Handout image'
  return toMarkdownImage(imageUrl, altText)
}

export function createNotesImageInsertActions(showToast: ShowToast): MarkdownEditorInsertAction[] {
  return [
    {
      id: 'insert-handout-image-url',
      icon: 'add_photo_alternate',
      label: 'Insert image URL',
      onSelect: () => insertImageFromUrl(showToast),
    },
    {
      id: 'upload-handout-image',
      icon: 'upload_file',
      label: 'Upload image',
      onSelect: async () => uploadImageMarkdown(showToast),
    },
  ]
}
