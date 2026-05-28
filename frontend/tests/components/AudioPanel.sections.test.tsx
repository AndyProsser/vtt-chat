import { render, screen } from '@testing-library/react'
import { type UUID } from '@shared'
import { describe, expect, it } from 'vitest'
import type { AudioDMOverride } from '@/types/audio'
import { AudioPresetsPanel } from '../../src/components/workspaces/session/audio/panels/AudioPresetsPanel'
import { AudioEffectsPanel } from '../../src/components/workspaces/session/audio/panels/AudioEffectsPanel'
import { AudioDMOverridesPanel } from '../../src/components/workspaces/session/audio/panels/AudioDMOverridesPanel'

describe('AudioPanel subcomponents', () => {
  it('renders presets section when active presets exist', () => {
    render(
      <AudioPresetsPanel
        currentEnvironment={{
          id: 'env-tavern',
          name: 'Tavern',
          reverbSend: 0.3,
          lowpassFreq: 8000,
          roomGain: 0,
        }}
      />
    )

    expect(screen.getByText('Presets')).toBeTruthy()
    expect(screen.getByText('Env: Tavern')).toBeTruthy()
  })

  it('renders effects summary', () => {
    render(<AudioEffectsPanel pttActive privateRoomCleanMode={false} activeEffectsCount={3} />)

    expect(screen.getByText('Effects')).toBeTruthy()
    expect(screen.getByText('PTT: On')).toBeTruthy()
    expect(screen.getByText('Active Effects: 3')).toBeTruthy()
  })

  it('renders DM override panel for DMs only', () => {
    const userOverrides = new Map<UUID, AudioDMOverride>()
    userOverrides.set('11111111-1111-4111-8111-111111111111' as UUID, {
      userId: '11111111-1111-4111-8111-111111111111' as UUID,
      overrideType: 'MUTE',
      appliedAt: Date.now(),
    })

    const overrides = new Map<UUID, Map<UUID, AudioDMOverride>>()
    overrides.set('22222222-2222-4222-8222-222222222222' as UUID, userOverrides)

    const { rerender } = render(<AudioDMOverridesPanel isDm dmOverrides={overrides} />)
    expect(screen.getByText('DM Overrides')).toBeTruthy()
    expect(screen.getByText('MUTE')).toBeTruthy()

    rerender(<AudioDMOverridesPanel isDm={false} dmOverrides={overrides} />)
    expect(screen.queryByText('DM Overrides')).toBeNull()
  })
})
