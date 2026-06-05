/**
 * DMDX Parser
 *
 * Splits markdown content into alternating segments of plain markdown and
 * DMDX fenced blocks. DMDX blocks use the syntax:
 *
 *   ```<type> [id=<id>]
 *   key: value
 *   ```
 *
 * Unknown fence types are returned as plain markdown segments so they
 * render as regular code blocks — no content is ever dropped.
 */

export type DmdxBlockType =
  | 'npc'
  | 'monster'
  | 'encounter'
  | 'loot'
  | 'spell'
  | 'session'
  | 'roll'
  | 'map'
  | 'timeline'

export const DMDX_BLOCK_TYPES = new Set<string>([
  'npc',
  'monster',
  'encounter',
  'loot',
  'spell',
  'session',
  'roll',
  'map',
  'timeline',
])

export type MarkdownSegment =
  | { kind: 'markdown'; text: string }
  | { kind: 'dmdx'; blockType: DmdxBlockType; id?: string; rawContent: string; parsed: DmdxParsed }

/** A permissive YAML-ish parse result — keys map to string, string[], or nested objects */
export type DmdxValue = string | string[] | Record<string, DmdxValue>
export type DmdxParsed = Record<string, DmdxValue>

/** Split full markdown into segments for rendering. */
export function splitMarkdownSegments(markdown: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  // Match opening and closing fences; capture type+id and inner content.
  // Uses a non-greedy match so consecutive fences are each handled separately.
  const fencePattern = /^```([a-z_-]+)([^\n]*)\n([\s\S]*?)^```\s*$/gm
  let lastIndex = 0

  for (const match of markdown.matchAll(fencePattern)) {
    const matchStart = match.index ?? 0
    const matchEnd = matchStart + match[0].length

    // Plain markdown before this fence
    if (matchStart > lastIndex) {
      const text = markdown.slice(lastIndex, matchStart)
      if (text) {
        segments.push({ kind: 'markdown', text })
      }
    }

    const rawType = match[1].toLowerCase()
    const afterType = match[2].trim()
    const rawContent = match[3]

    if (DMDX_BLOCK_TYPES.has(rawType)) {
      const id = afterType.startsWith('id=') ? afterType.slice(3).trim() : undefined
      segments.push({
        kind: 'dmdx',
        blockType: rawType as DmdxBlockType,
        id,
        rawContent,
        parsed: parseDmdxContent(rawContent),
      })
    } else {
      // Unknown fence — preserve as markdown so it renders as a code block
      segments.push({ kind: 'markdown', text: match[0] })
    }

    lastIndex = matchEnd
  }

  // Trailing plain markdown
  if (lastIndex < markdown.length) {
    const text = markdown.slice(lastIndex)
    if (text) {
      segments.push({ kind: 'markdown', text })
    }
  }

  if (segments.length === 0 && markdown) {
    segments.push({ kind: 'markdown', text: markdown })
  }

  return segments
}

/**
 * Permissive YAML-ish parser.
 *
 * Handles:
 *   - Simple key: value
 *   - Multiline values with > or | (YAML block scalars — simplified)
 *   - List values: items starting with "  - "
 *   - Nested blocks: "abilities:\n  str: 8"
 *
 * On any parse ambiguity, content is preserved as a raw string value.
 */
export function parseDmdxContent(raw: string): DmdxParsed {
  const result: DmdxParsed = {}
  const lines = raw.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip blank lines at top level
    if (!line.trim()) {
      i++
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx <= 0) {
      i++
      continue
    }

    const key = line.slice(0, colonIdx).trim()
    const rest = line.slice(colonIdx + 1).trim()

    if (!key) {
      i++
      continue
    }

    // Block scalar (> or |): collect until de-indent or end
    if (rest === '>' || rest === '|') {
      const scalarLines: string[] = []
      i++
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].trim() === '')) {
        scalarLines.push(lines[i].slice(2))
        i++
      }
      result[key] = scalarLines.join('\n').trimEnd()
      continue
    }

    // List items: next lines that start with "  -"
    if (rest === '') {
      const listItems: string[] = []
      const nestedPairs: Array<[string, string]> = []
      let j = i + 1

      while (j < lines.length) {
        const nextLine = lines[j]
        if (nextLine.trim() === '') {
          j++
          continue
        }
        if (nextLine.startsWith('  - ')) {
          listItems.push(nextLine.slice(4).trim())
          j++
          continue
        }
        // Nested key: value (indented)
        if (nextLine.startsWith('  ') && nextLine.includes(':')) {
          const idx = nextLine.indexOf(':')
          nestedPairs.push([nextLine.slice(0, idx).trim(), nextLine.slice(idx + 1).trim()])
          j++
          continue
        }
        break
      }

      if (listItems.length > 0) {
        result[key] = listItems
        i = j
      } else if (nestedPairs.length > 0) {
        const nested: DmdxParsed = {}
        for (const [k, v] of nestedPairs) {
          nested[k] = v
        }
        result[key] = nested
        i = j
      } else {
        result[key] = ''
        i++
      }
      continue
    }

    // Simple key: value
    result[key] = rest
    i++
  }

  return result
}

/** Safe string extraction from parsed values */
export function dmdxStr(parsed: DmdxParsed, key: string, fallback = ''): string {
  const val = parsed[key]
  if (typeof val === 'string') return val
  if (Array.isArray(val)) return val.join(', ')
  return fallback
}

/** Safe string array extraction */
export function dmdxArr(parsed: DmdxParsed, key: string): string[] {
  const val = parsed[key]
  if (Array.isArray(val)) return val
  if (typeof val === 'string' && val) return [val]
  return []
}

/** Safe nested object extraction */
export function dmdxObj(parsed: DmdxParsed, key: string): Record<string, string> {
  const val = parsed[key]
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])
    )
  }
  return {}
}

/**
 * Evaluates a simple dice expression deterministically (sum of average values).
 * Returns { expression, average, min, max } or null if unparseable.
 */
export function evaluateDiceExpression(expr: string): {
  expression: string
  average: number
  min: number
  max: number
} | null {
  const clean = expr.trim().replace(/\s+/g, '')
  // Pattern: XdY+Z or XdY-Z or XdY
  const pattern = /^(\d+)d(\d+)([+-]\d+)?$/i
  const match = clean.match(pattern)

  if (!match) {
    // Try plain number
    const n = Number(clean)
    if (!Number.isNaN(n)) {
      return { expression: clean, average: n, min: n, max: n }
    }
    return null
  }

  const count = parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  const min = count + modifier
  const max = count * sides + modifier
  const average = Math.floor((min + max) / 2)

  return { expression: clean, average, min, max }
}
