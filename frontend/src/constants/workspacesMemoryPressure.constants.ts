import {
  WORKSPACES_MEMORY_PRESSURE_POLL_MS,
  WORKSPACES_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS,
  WORKSPACES_MEMORY_PRESSURE_RELOAD_GRACE_MS,
  WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES,
} from '@/constants/workspaces.constants'

declare global {
  interface Window {
    __VTT_DEBUG_MEMORY_PRESSURE__?: boolean | 'warn' | 'reload' | 'off' | string
  }
}

export type MemoryPressureSimulationMode = 'off' | 'warn' | 'reload'

export type MemoryPressureGuardConfig = {
  thresholdBytes: number
  pollMs: number
  reloadGraceMs: number
  reloadCooldownMs: number
  simulationMode: MemoryPressureSimulationMode
}

export type MemoryPressureHumorMessage = {
  index: number
  text: string
}

const MEMORY_PRESSURE_DRY_HUMOR_LINES = [
  'The wizard prepared too many tabs and forgot Counterspell.',
  'The party has reached the carry-capacity rules nobody reads.',
  'Your bag of holding is making that seam-splitting sound again.',
  'The dungeon master of garbage collection is looking concerned.',
  'This encounter has become mostly difficult terrain for Chrome.',
  'A gelatinous cube now owns part of the heap.',
  'The rogue insists this memory leak is a feature called stealth retention.',
  'A rules lawyer has determined the tab is encumbered.',
  'The bard says everything is under control, which is rarely comforting.',
  'The cleric can heal hit points, not browser pressure.',
  'The sorcerer solved this by creating a second problem of equal size.',
  'Your session appears to be multiclassing into siege engine.',
  'The mimic was not the treasure chest. It was the allocation graph.',
  'The dice are fine. The heap is having a dramatic monologue.',
  'A goblin has been promoted to Director of Unreleased References.',
  'The necromancer keeps reanimating objects that should have been collected.',
  'This tab is now roleplaying as a trebuchet.',
  'The innkeeper says one more megabyte and you pay for a second room.',
  'The dragon is less dangerous than the open tooltip subtree.',
  'Even the warlock thinks this pact has too much hidden cost.',
  'The ranger can track beasts, but not who kept this closure alive.',
  'The module is fine; the side quests are nesting uncontrollably.',
  'A very small kobold is hauling a very large object graph.',
  'The encounter budget did not account for forty-seven active portals.',
  'This feels like the sort of problem a dwarf would solve with an axe.',
  'The artificer built a memory palace and then refused to leave it.',
  'A cursed item has attached itself to the render tree.',
  'The paladin senses a great disturbance in the heap and disapproves.',
  'The party split, and unfortunately the references did not.',
  'The tavern is full, the stable is full, and now so is the tab.',
  'Someone cast Animate Object on the cache and forgot concentration.',
  'The familiar was told to fetch bytes, not adopt them.',
  'The oracle predicts a short rest and an immediate reload.',
  'This session has exceeded the recommended number of suspicious relics.',
  'The dungeon is not infinite. The listener list should follow that example.',
  'The monk has achieved inner peace. The browser has not.',
  'The lich calls this excellent retention, which is not helping.',
  'The caravan can continue, but the wagon wheels are warm.',
  'The map is fine; it is the twelve invisible map copies that worry us.',
  'A beholder has opened several unnecessary eye rays into memory.',
  'The quest log is now technically a siege weapon.',
  'The guild recommends a strategic retreat and a very ordinary refresh.',
  'The apprentice labelled this stable. The archmage has left the room.',
  'The cursed scroll keeps saying just one more portal.',
  'The DM screen is holding. The browser screen is negotiating.',
  'The town crier reports unusual activity in the province of heap space.',
  'The golem is loyal, but it does not understand cleanup callbacks.',
  'The ritual circle is intact. The runtime circle is less convincing.',
  'The captain says the ship still floats, but only philosophically.',
  'The treasure hoard has become an accounting problem.',
] as const

function parsePositiveNumber(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseSimulationMode(rawValue: string | boolean | undefined): MemoryPressureSimulationMode {
  if (rawValue === true) {
    return 'warn'
  }

  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()

  if (!normalized || normalized === '0' || normalized === 'false' || normalized === 'off') {
    return 'off'
  }

  if (normalized === 'reload' || normalized === 'force' || normalized === '2') {
    return 'reload'
  }

  return 'warn'
}

export function getWorkspacesMemoryPressureGuardConfig(): MemoryPressureGuardConfig {
  const runtimeSimulation =
    typeof window !== 'undefined' ? window.__VTT_DEBUG_MEMORY_PRESSURE__ : undefined

  return {
    thresholdBytes: parsePositiveNumber(
      import.meta.env.VITE_MEMORY_PRESSURE_THRESHOLD_BYTES,
      parsePositiveNumber(
        import.meta.env.VITE_MEMORY_PRESSURE_THRESHOLD_MB,
        WORKSPACES_MEMORY_PRESSURE_THRESHOLD_BYTES / 1_000_000
      ) * 1_000_000
    ),
    pollMs: parsePositiveNumber(
      import.meta.env.VITE_MEMORY_PRESSURE_POLL_MS,
      WORKSPACES_MEMORY_PRESSURE_POLL_MS
    ),
    reloadGraceMs: parsePositiveNumber(
      import.meta.env.VITE_MEMORY_PRESSURE_RELOAD_GRACE_MS,
      WORKSPACES_MEMORY_PRESSURE_RELOAD_GRACE_MS
    ),
    reloadCooldownMs: parsePositiveNumber(
      import.meta.env.VITE_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS,
      WORKSPACES_MEMORY_PRESSURE_RELOAD_COOLDOWN_MS
    ),
    simulationMode: import.meta.env.DEV
      ? parseSimulationMode(runtimeSimulation || import.meta.env.VITE_DEBUG_MEMORY_PRESSURE)
      : 'off',
  }
}

export function getRandomMemoryPressureHumorMessage(): MemoryPressureHumorMessage {
  const index = Math.floor(Math.random() * MEMORY_PRESSURE_DRY_HUMOR_LINES.length)
  return {
    index,
    text: MEMORY_PRESSURE_DRY_HUMOR_LINES[index],
  }
}

export function formatMemoryPressureReloadSeconds(reloadGraceMs: number): number {
  return Math.max(1, Math.ceil(reloadGraceMs / 1000))
}
