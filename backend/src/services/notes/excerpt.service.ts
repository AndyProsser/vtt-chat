/**
 * Excerpt generation for note handout surfacing.
 * Implements the deterministic algorithm from docs/changes/NOTES-JOURNAL-IMPLEMENTATION-CHECKLIST.md §3.7.
 *
 * Rules (in order):
 * 1. Manual override wins if non-empty after trim.
 * 2. Strip markdown syntax; collapse whitespace.
 * 3. Take first complete sentence ≤ 180 chars; else cut at word boundary; hard cap 220.
 * 4. Fallback when text is empty: name → "Shared handout".
 */

const MAX_EXCERPT_LENGTH = 180
const EXCERPT_HARD_CAP = 220

function stripMarkdown(md: string): string {
  return (
    md
      // Remove fenced code blocks before anything else
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Preserve link label, remove URL: [label](url)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      // Remove images entirely (inline base64 would bloat excerpt)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '[image]')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Remove headings markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic markers
      .replace(/[*_]{1,3}([^*_\n]+)[*_]{1,3}/g, '$1')
      // Remove blockquote markers
      .replace(/^>\s*/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove unordered list markers
      .replace(/^[-*+]\s+/gm, '')
      // Remove ordered list markers
      .replace(/^\d+\.\s+/gm, '')
      // Collapse whitespace (newlines → spaces)
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function cutAtWordBoundary(text: string, maxLen: number, ellipsis = true): string {
  if (text.length <= maxLen) {
    return text
  }

  const cut = text.lastIndexOf(' ', maxLen)
  const slice = cut > 0 ? text.slice(0, cut) : text.slice(0, maxLen)
  return ellipsis ? slice + '...' : slice
}

/**
 * Generates a plain-text excerpt from markdown content.
 * Returns both the excerpt text and the source ('AUTO' | 'MANUAL').
 */
export function generateExcerpt(
  markdown: string,
  options?: { manualOverride?: string; fallbackTitle?: string }
): { excerpt: string; excerptSource: 'AUTO' | 'MANUAL' } {
  const { manualOverride, fallbackTitle } = options ?? {}

  // Rule 1: manual override wins
  if (manualOverride && manualOverride.trim().length > 0) {
    const sanitized = manualOverride
      .trim()
      // Strip external URLs and HTML from manual override for safety
      .replace(/<[^>]+>/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, EXCERPT_HARD_CAP)

    return { excerpt: sanitized, excerptSource: 'MANUAL' }
  }

  // Rule 2: normalize source text
  const text = stripMarkdown(markdown)

  // Rule 4: fallback when normalized text is too sparse
  if (text.length < 3) {
    if (fallbackTitle && fallbackTitle.trim().length > 0) {
      return { excerpt: fallbackTitle.trim().slice(0, EXCERPT_HARD_CAP), excerptSource: 'AUTO' }
    }

    return { excerpt: 'Shared handout', excerptSource: 'AUTO' }
  }

  // Rule 3: prefer first complete sentence ≤ MAX_EXCERPT_LENGTH
  const sentenceMatch = /^[^.!?]+[.!?]/.exec(text)
  if (sentenceMatch && sentenceMatch[0].length <= MAX_EXCERPT_LENGTH) {
    return { excerpt: sentenceMatch[0].trim(), excerptSource: 'AUTO' }
  }

  // Cut at word boundary ≤ MAX_EXCERPT_LENGTH, hard cap EXCERPT_HARD_CAP
  return { excerpt: cutAtWordBoundary(text, MAX_EXCERPT_LENGTH), excerptSource: 'AUTO' }
}
