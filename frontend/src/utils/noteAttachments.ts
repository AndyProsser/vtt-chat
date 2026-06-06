import type { NoteAttachmentEntity, UUID } from '@shared'
import type { ShowToastInput } from '@/state/toastCenter'

export const NOTE_ATTACHMENT_MAX_COUNT = 6
const MAX_DATA_URL_LENGTH = 32_000
const MAX_IMAGE_DIMENSION = 1280
const INITIAL_QUALITY = 0.82
const MIN_QUALITY = 0.42

type ShowToast = (input: ShowToastInput) => void

export interface PreparedNoteImage {
  dataUrl: string
  mime: string
  name: string
}

export async function pickNoteImageFiles(multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files || []))
    input.click()
  })
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

async function compressImageFile(file: File): Promise<PreparedNoteImage> {
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
    throw new Error('Unable to process handout image.')
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight)

  let quality = INITIAL_QUALITY
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_DATA_URL_LENGTH && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - 0.08)
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error(
      'Image is too large for note storage. Use a smaller image or insert an external image URL.'
    )
  }

  return {
    dataUrl,
    mime: 'image/jpeg',
    name: file.name.replace(/\.[a-zA-Z0-9]+$/, '') || 'Handout image',
  }
}

export async function prepareNoteImage(
  file: File,
  showToast: ShowToast
): Promise<PreparedNoteImage | null> {
  if (!file.type.startsWith('image/')) {
    showToast({ variant: 'error', message: 'Handout image must be an image file.' })
    return null
  }

  try {
    return await compressImageFile(file)
  } catch (error) {
    showToast({
      variant: 'error',
      message: error instanceof Error ? error.message : 'Unable to process handout image.',
    })
    return null
  }
}

export async function createNoteAttachmentsFromPicker(
  campaignId: UUID,
  showToast: ShowToast,
  remainingSlots = NOTE_ATTACHMENT_MAX_COUNT
): Promise<NoteAttachmentEntity[]> {
  const files = await pickNoteImageFiles(true)
  const attachments: NoteAttachmentEntity[] = []

  for (const file of files.slice(0, remainingSlots)) {
    const prepared = await prepareNoteImage(file, showToast)
    if (!prepared) {
      continue
    }

    attachments.push({
      id: crypto.randomUUID() as UUID,
      campaignId,
      mime: prepared.mime,
      name: prepared.name,
      uri: prepared.dataUrl,
      createdAt: Date.now(),
    })
  }

  if (files.length > remainingSlots) {
    showToast({
      variant: 'error',
      message: `Only ${remainingSlots} more attachment${remainingSlots === 1 ? '' : 's'} can be added.`,
    })
  }

  return attachments
}
