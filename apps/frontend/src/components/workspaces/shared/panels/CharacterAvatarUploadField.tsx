import { useId, useRef, useState, type ChangeEvent } from 'react'
import { useToast } from '@/hooks/useToast'

const AVATAR_PREVIEW_SIZE = 104
const AVATAR_OUTPUT_SIZE = 192
const MAX_AVATAR_FILE_SIZE_BYTES = 8 * 1024 * 1024

interface PendingAvatarCrop {
  src: string
  width: number
  height: number
  zoom: number
  offsetXPercent: number
  offsetYPercent: number
}

interface CharacterAvatarUploadFieldProps {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('Unable to read image.'))
    }
    reader.onerror = () => reject(new Error('Unable to read image.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load image.'))
    image.src = source
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

async function cropAvatarImage(pending: PendingAvatarCrop): Promise<string> {
  const image = await loadImage(pending.src)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to prepare avatar crop.')
  }

  const cropSize = AVATAR_PREVIEW_SIZE
  const baseScale = Math.max(cropSize / pending.width, cropSize / pending.height)
  const scaledWidth = pending.width * baseScale * pending.zoom
  const scaledHeight = pending.height * baseScale * pending.zoom
  const maxOffsetX = Math.max(0, (scaledWidth - cropSize) / 2)
  const maxOffsetY = Math.max(0, (scaledHeight - cropSize) / 2)
  const offsetX = (pending.offsetXPercent / 100) * maxOffsetX
  const offsetY = (pending.offsetYPercent / 100) * maxOffsetY
  const renderScale = AVATAR_OUTPUT_SIZE / cropSize

  context.clearRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE)
  context.drawImage(
    image,
    ((cropSize - scaledWidth) / 2 + offsetX) * renderScale,
    ((cropSize - scaledHeight) / 2 + offsetY) * renderScale,
    scaledWidth * renderScale,
    scaledHeight * renderScale
  )

  return canvas.toDataURL('image/png')
}

export function CharacterAvatarUploadField(props: CharacterAvatarUploadFieldProps) {
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const showToast = useToast()
  const [pendingCrop, setPendingCrop] = useState<PendingAvatarCrop | null>(null)
  const [isApplyingCrop, setIsApplyingCrop] = useState(false)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      showToast({ variant: 'error', message: 'Avatar must be an image file.' })
      return
    }

    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      showToast({ variant: 'error', message: 'Avatar image is too large.' })
      return
    }

    try {
      const src = await readFileAsDataUrl(file)
      const image = await loadImage(src)
      setPendingCrop({
        src,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        zoom: 1,
        offsetXPercent: 0,
        offsetYPercent: 0,
      })
    } catch (error) {
      showToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Unable to read avatar image.',
      })
    }
  }

  const handleApplyCrop = async () => {
    if (!pendingCrop) {
      return
    }

    setIsApplyingCrop(true)
    try {
      const nextValue = await cropAvatarImage(pendingCrop)
      props.onChange(nextValue)
      setPendingCrop(null)
    } catch (error) {
      showToast({
        variant: 'error',
        message: error instanceof Error ? error.message : 'Unable to crop avatar image.',
      })
    } finally {
      setIsApplyingCrop(false)
    }
  }

  const preview = pendingCrop?.src || props.value
  const maxOffsetX = pendingCrop
    ? Math.max(
        0,
        (pendingCrop.width *
          Math.max(
            AVATAR_PREVIEW_SIZE / pendingCrop.width,
            AVATAR_PREVIEW_SIZE / pendingCrop.height
          ) *
          pendingCrop.zoom -
          AVATAR_PREVIEW_SIZE) /
          2
      )
    : 0
  const maxOffsetY = pendingCrop
    ? Math.max(
        0,
        (pendingCrop.height *
          Math.max(
            AVATAR_PREVIEW_SIZE / pendingCrop.width,
            AVATAR_PREVIEW_SIZE / pendingCrop.height
          ) *
          pendingCrop.zoom -
          AVATAR_PREVIEW_SIZE) /
          2
      )
    : 0

  return (
    <div className="crbs-field crbs-field--avatar">
      <span className="crbs-field-label">Avatar</span>
      <div className="crbs-avatar-field">
        <div className="crbs-avatar-preview-shell">
          <div className="crbs-avatar-preview">
            {preview ? (
              pendingCrop ? (
                <img
                  src={pendingCrop.src}
                  alt="Avatar crop preview"
                  className="crbs-avatar-preview__image"
                  style={{
                    transform: `translate(${(pendingCrop.offsetXPercent / 100) * maxOffsetX}px, ${(pendingCrop.offsetYPercent / 100) * maxOffsetY}px) scale(${pendingCrop.zoom})`,
                  }}
                />
              ) : (
                <img src={preview} alt="Character avatar" className="crbs-avatar-preview__image" />
              )
            ) : (
              <span className="crbs-avatar-preview__placeholder">No avatar</span>
            )}
          </div>
        </div>

        <div className="crbs-avatar-controls">
          <p className="crbs-description">
            Upload an image, then zoom and crop it into a circular avatar.
          </p>
          <div className="crbs-avatar-actions">
            <input
              id={inputId}
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="crbs-avatar-file-input"
              onChange={handleFileChange}
              disabled={props.disabled || isApplyingCrop}
            />
            <button
              type="button"
              className="crbs-avatar-button"
              disabled={props.disabled || isApplyingCrop}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload image
            </button>
            <button
              type="button"
              className="crbs-avatar-button crbs-avatar-button--ghost"
              disabled={props.disabled || isApplyingCrop || !props.value}
              onClick={() => {
                props.onChange('')
                setPendingCrop(null)
              }}
            >
              Remove
            </button>
          </div>

          {pendingCrop ? (
            <div className="crbs-avatar-crop-controls">
              <label className="crbs-field" htmlFor={`${inputId}-zoom`}>
                <span className="crbs-field-label">Zoom</span>
                <input
                  id={`${inputId}-zoom`}
                  type="range"
                  min="1"
                  max="3"
                  step="0.01"
                  value={pendingCrop.zoom}
                  onChange={(event) =>
                    setPendingCrop((current) =>
                      current
                        ? { ...current, zoom: Number.parseFloat(event.target.value) || 1 }
                        : current
                    )
                  }
                  disabled={props.disabled || isApplyingCrop}
                />
              </label>

              <label className="crbs-field" htmlFor={`${inputId}-offset-x`}>
                <span className="crbs-field-label">Horizontal crop</span>
                <input
                  id={`${inputId}-offset-x`}
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={pendingCrop.offsetXPercent}
                  onChange={(event) =>
                    setPendingCrop((current) =>
                      current
                        ? {
                            ...current,
                            offsetXPercent: clamp(
                              Number.parseFloat(event.target.value) || 0,
                              -100,
                              100
                            ),
                          }
                        : current
                    )
                  }
                  disabled={props.disabled || isApplyingCrop || maxOffsetX === 0}
                />
              </label>

              <label className="crbs-field" htmlFor={`${inputId}-offset-y`}>
                <span className="crbs-field-label">Vertical crop</span>
                <input
                  id={`${inputId}-offset-y`}
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  value={pendingCrop.offsetYPercent}
                  onChange={(event) =>
                    setPendingCrop((current) =>
                      current
                        ? {
                            ...current,
                            offsetYPercent: clamp(
                              Number.parseFloat(event.target.value) || 0,
                              -100,
                              100
                            ),
                          }
                        : current
                    )
                  }
                  disabled={props.disabled || isApplyingCrop || maxOffsetY === 0}
                />
              </label>

              <div className="crbs-avatar-actions">
                <button
                  type="button"
                  className="crbs-avatar-button"
                  disabled={props.disabled || isApplyingCrop}
                  onClick={() => void handleApplyCrop()}
                >
                  {isApplyingCrop ? 'Applying…' : 'Apply crop'}
                </button>
                <button
                  type="button"
                  className="crbs-avatar-button crbs-avatar-button--ghost"
                  disabled={props.disabled || isApplyingCrop}
                  onClick={() => setPendingCrop(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
