/**
 * Chat Command Parser
 * Detects slash commands in chat input and validates them against the registry.
 * Client-side checks are UX gates only — backend re-validates all permissions.
 */

import {
  CHAT_COMMANDS,
  findChatCommand,
  commandsForRole,
  VOICE_PRESETS,
  ENVIRONMENT_PRESETS,
  type ChatCommandDefinition,
  type ChatCommandName,
  Role,
  type SessionState,
} from '@shared'

export interface ParsedCommand {
  name: ChatCommandName
  /** Slash word as typed, e.g. "/roll" */
  slash: string
  /** Everything after the command word, trimmed */
  args: string
  /** Full original input */
  raw: string
}

export interface CommandValidationError {
  kind: 'UNKNOWN_COMMAND' | 'PERMISSION_DENIED' | 'UNAVAILABLE_IN_STATE'
  message: string
}

export type CommandParseResult =
  | { ok: true; command: ParsedCommand; definition: ChatCommandDefinition }
  | { ok: false; error: CommandValidationError }
  | { ok: null } // Not a command — plain text

/**
 * Parse a chat input string.
 * Returns null if the input is not a slash command, an error result if the command
 * is invalid or denied, or a parsed command on success.
 */
export function parseChatInput(
  input: string,
  role: Role | string,
  sessionState: SessionState | undefined
): CommandParseResult {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return { ok: null }

  // Extract the command word (first token after /)
  const [rawWord, ...rest] = trimmed.split(/\s+/)
  const word = rawWord.toLowerCase().replace(/^\//, '')
  const args = rest.join(' ')

  const definition = findChatCommand(word)
  if (!definition) {
    return {
      ok: false,
      error: {
        kind: 'UNKNOWN_COMMAND',
        message: `Unknown command /${word}. Type / to see available commands.`,
      },
    }
  }

  const normalizedRole = String(role) as Role
  if (!definition.roles.includes(normalizedRole)) {
    return {
      ok: false,
      error: {
        kind: 'PERMISSION_DENIED',
        message: `/${definition.name} is not available to your role.`,
      },
    }
  }

  if (sessionState && !definition.availableInStates.includes(sessionState)) {
    return {
      ok: false,
      error: {
        kind: 'UNAVAILABLE_IN_STATE',
        message: `That action isn't available while the session is ${sessionState.toLowerCase()}.`,
      },
    }
  }

  return {
    ok: true,
    command: {
      name: definition.name,
      slash: rawWord,
      args,
      raw: trimmed,
    },
    definition,
  }
}

/** Commands hidden when the composer is in whisper-group mode (PRIVATE room). */
const WHISPER_GROUP_EXCLUDED: Set<string> = new Set(['ic', 'ooc', 'whisper'])

/**
 * Return commands matching a partial slash prefix, filtered by role, session state,
 * and composer context (whisper-group mode hides IC/OOC/whisper commands).
 * Used by the autocomplete palette when the user types "/".
 */
export function filterCommandsForAutocomplete(
  input: string,
  role: Role | string,
  sessionState?: SessionState,
  isWhisperGroup?: boolean
): ChatCommandDefinition[] {
  const trimmed = input.trimStart()
  if (!trimmed.startsWith('/')) return []

  // Only autocomplete on the command word itself (before any space)
  if (trimmed.includes(' ')) return []

  const partial = trimmed.slice(1).toLowerCase()
  let commands = commandsForRole(String(role) as Role)

  if (sessionState) {
    commands = commands.filter((cmd) => cmd.availableInStates.includes(sessionState))
  }

  if (isWhisperGroup) {
    commands = commands.filter((cmd) => !WHISPER_GROUP_EXCLUDED.has(cmd.name))
  }

  if (!partial) return commands
  return commands.filter(
    (cmd) => cmd.name.startsWith(partial) || cmd.slash.toLowerCase().includes(partial)
  )
}

/** True if the input begins with "/" (triggers autocomplete or help). */
export function isCommandInput(input: string): boolean {
  return input.trimStart().startsWith('/')
}

export interface ArgSuggestion {
  id: string
  label: string
}

export interface ArgSuggestionResult {
  commandName: string
  suggestions: ArgSuggestion[]
}

/** Static voice preset options including "off" and "default" to clear the effect. */
const VOICE_ARG_OPTIONS: ArgSuggestion[] = [
  ...VOICE_PRESETS.map((p) => ({ id: p.name, label: p.name })),
  { id: 'off', label: 'off' },
  { id: 'default', label: 'default' },
]

const ENV_ARG_OPTIONS: ArgSuggestion[] = ENVIRONMENT_PRESETS.map((p) => ({
  id: p.name,
  label: p.name,
}))

/**
 * Returns arg-level autocomplete suggestions when the user has already typed a
 * recognised command word and a space, and is now typing the argument.
 * Covers /voice and /env. /condition player suggestions require dynamic session
 * data and are handled upstream in MessageInput.
 *
 * Returns null if the arg is complete (trailing space) or the command has no
 * static arg completions.
 */
export function getArgSuggestions(input: string): ArgSuggestionResult | null {
  const trimmed = input.trimStart()
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return null

  const commandWord = trimmed.slice(1, spaceIdx).toLowerCase()
  const argPart = trimmed.slice(spaceIdx + 1)

  // Trailing space means the arg is complete — no more suggestions
  if (argPart.endsWith(' ')) return null

  const partial = argPart.toLowerCase()

  if (commandWord === 'voice') {
    return {
      commandName: 'voice',
      suggestions: partial
        ? VOICE_ARG_OPTIONS.filter((o) => o.label.toLowerCase().startsWith(partial))
        : VOICE_ARG_OPTIONS,
    }
  }

  if (commandWord === 'env') {
    return {
      commandName: 'env',
      suggestions: partial
        ? ENV_ARG_OPTIONS.filter((o) => o.label.toLowerCase().startsWith(partial))
        : ENV_ARG_OPTIONS,
    }
  }

  return null
}

/** All available commands for a given role (for the help popup). */
export function getCommandsForRole(role: Role | string): ChatCommandDefinition[] {
  return commandsForRole(String(role) as Role)
}
