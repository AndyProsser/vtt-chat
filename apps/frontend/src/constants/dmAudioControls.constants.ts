export const FILTER_PRESETS: Array<{ id: string; name: string; params: Record<string, unknown> }> =
  [
    {
      id: 'filter-radio',
      name: 'Radio',
      params: { lowpassHz: 2400, highpassHz: 300, drive: 0.05 },
    },
    {
      id: 'filter-whisper',
      name: 'Whisper',
      params: { lowpassHz: 5200, gain: 0.75, breathMix: 0.2 },
    },
    {
      id: 'filter-helmet',
      name: 'Helmet',
      params: { lowpassHz: 1800, resonance: 0.7, gain: 0.85 },
    },
  ]

export const OVERRIDE_CONFIRMATION_TIMEOUT_MS = 10000
export const ROOM_MOVE_CONFIRMATION_TIMEOUT_MS = 10000
