import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarOverlay } from '@/components/workspaces/session/rooms/AvatarOverlay'

describe('AvatarOverlay', () => {
  it('renders without a speaking ring when no speaking subscription is wired', () => {
    render(<AvatarOverlay username="Mock Bard" roleLabel="PLAYER" metaLine="Level 3 Bard" />)

    const overlay = screen.getByTestId('avatar-overlay')
    expect(overlay.querySelector('.avatar-glyph__speaking-ring')).toBeNull()
  })

  it('renders without a speaking ring when speaking subscription is wired but store has no bit', () => {
    render(
      <AvatarOverlay
        username="Mock Rogue"
        roleLabel="PLAYER"
        metaLine="Level 4 Rogue"
        speaking={{
          sessionId: '00000000-0000-0000-0000-000000000001',
          userId: '00000000-0000-0000-0000-000000000002',
        }}
      />
    )

    const overlay = screen.getByTestId('avatar-overlay')
    expect(overlay.querySelector('.avatar-glyph__speaking-ring')).toBeNull()
  })
})
