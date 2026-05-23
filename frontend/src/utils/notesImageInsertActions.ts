import type { MarkdownEditorInsertAction } from '@/components/workspaces/shared/panels/MarkdownEditor'
import type { ShowToastInput } from '@/state/toastCenter'

const MAX_DATA_URL_LENGTH = 32_000
const MAX_IMAGE_DIMENSION = 1280
const INITIAL_QUALITY = 0.82
const MIN_QUALITY = 0.42

type ShowToast = (input: ShowToastInput) => void

function escapeMarkdownAltText(value: string): string {
  return value.replace(/[\\[\]]/g, '\\$&')
}

function toMarkdownImage(url: string, altText: string): string {
  const safeAlt = escapeMarkdownAltText(altText.trim() || 'Handout image')
  return `![${safeAlt}](${url})`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to read image file.'))
        return
      }

      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('Unable to read image file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to process image file.'))
    image.src = dataUrl
  })
}

async function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0] || null
      resolve(file)
    }
    input.click()
  })
}

async function uploadImageMarkdown(showToast: ShowToast): Promise<string> {
  const file = await pickImageFile()
  if (!file) {
    return ''
  }

  if (!file.type.startsWith('image/')) {
    showToast({ variant: 'error', message: 'Handout image must be an image file.' })
    return ''
  }

  try {
    const originalDataUrl = await readFileAsDataUrl(file)
    const image = await loadImage(originalDataUrl)

    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const context = canvas.getContext('2d')
    if (!context) {
      showToast({ variant: 'error', message: 'Unable to process handout image.' })
      return ''
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight)

    let quality = INITIAL_QUALITY
    let dataUrl = canvas.toDataURL('image/jpeg', quality)
    while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > MIN_QUALITY) {
      quality = Math.max(MIN_QUALITY, quality - 0.08)
      dataUrl = canvas.toDataURL('image/jpeg', quality)
    }

    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      showToast({
        variant: 'error',
        message:
          'Image is too large for note storage. Use a smaller image or insert an external image URL.',
      })
      return ''
    }

    const altText = file.name.replace(/\.[a-zA-Z0-9]+$/, '') || 'Handout image'
    return toMarkdownImage(dataUrl, altText)
  } catch (error) {
    showToast({
      variant: 'error',
      message: error instanceof Error ? error.message : 'Unable to process handout image.',
    })
    return ''
  }
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
