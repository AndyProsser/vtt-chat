import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarOverlay } from '@/components/rooms/AvatarOverlay'

describe('AvatarOverlay', () => {
  it('applies speaking highlight classes when isSpeaking is true', () => {
    render(
      <AvatarOverlay
        username="Mock Bard"
        roleLabel="PLAYER"
        metaLine="Level 3 Bard"
        isSpeaking={true}
      />
    )

    const overlay = screen.getByTestId('avatar-overlay')
    expect(overlay.className).toContain('avatar-overlay--speaking')

    const glyph = overlay.querySelector('.avatar-glyph')
    expect(glyph?.className).toContain('avatar-glyph--speaking')
  })

  it('does not apply speaking highlight classes when isSpeaking is false', () => {
    render(
      <AvatarOverlay
        username="Mock Rogue"
        roleLabel="PLAYER"
        metaLine="Level 4 Rogue"
        isSpeaking={false}
      />
    )

    const overlay = screen.getByTestId('avatar-overlay')
    expect(overlay.className).not.toContain('avatar-overlay--speaking')

    const glyph = overlay.querySelector('.avatar-glyph')
    expect(glyph?.className).not.toContain('avatar-glyph--speaking')
  })
})
