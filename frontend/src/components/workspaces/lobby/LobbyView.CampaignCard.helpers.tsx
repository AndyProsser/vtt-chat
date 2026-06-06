import type { CampaignSummary } from '@/types/session/campaign'

export type CampaignVisualState = 'ACTIVE' | 'PAUSED' | 'COOLDOWN' | 'IDLE' | 'ENDED' | 'INACTIVE'

export function getCampaignVisualState(campaign: CampaignSummary): CampaignVisualState {
  const hasConnectedTable = Boolean(campaign.dmOnline) || (campaign.connectedPlayers ?? 0) > 0

  if (!hasConnectedTable || campaign.latestSessionState === 'CLEANUP') {
    return 'INACTIVE'
  }

  if (campaign.latestSessionState === 'ACTIVE' || campaign.latestSessionState === 'PAUSED') {
    return 'ACTIVE'
  }

  if (campaign.latestSessionState === 'COOLDOWN') {
    return 'COOLDOWN'
  }

  if (campaign.latestSessionState === 'ENDED') {
    return 'ENDED'
  }

  return 'IDLE'
}

export function getCampaignVisualStateLabel(state: CampaignVisualState): string {
  if (state === 'IDLE') return 'Ready'
  if (state === 'INACTIVE') return 'Offline'
  if (state === 'COOLDOWN') return 'Finishing'
  return state.charAt(0) + state.slice(1).toLowerCase()
}

export function formatLastActiveLabel(campaign: CampaignSummary): string {
  const rawTimestamp = campaign.updatedAt ?? campaign.createdAt
  if (rawTimestamp === undefined || rawTimestamp === null) return 'Unknown'
  const numeric =
    typeof rawTimestamp === 'number'
      ? rawTimestamp
      : Number.isFinite(Number(rawTimestamp))
        ? Number(rawTimestamp)
        : Date.parse(String(rawTimestamp))
  if (!Number.isFinite(numeric)) return 'Unknown'
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(numeric))
  } catch {
    return 'Unknown'
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null = tokenRegex.exec(text)

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={`${keyPrefix}-em-${match.index}`}>{token.slice(1, -1)}</em>)
    } else {
      nodes.push(token)
    }

    lastIndex = match.index + token.length
    match = tokenRegex.exec(text)
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

export function renderCampaignDescription(markdown?: string | null): React.ReactNode {
  const source = (markdown || '').trim()
  if (!source) {
    return <p>No description provided.</p>
  }

  const lines = source.split(/\r?\n/)
  const nodes: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(' ').trim()
    if (text) {
      nodes.push(<p key={`p-${nodes.length}`}>{renderInlineMarkdown(text, `p-${nodes.length}`)}</p>)
    }
    paragraphBuffer = []
  }

  const flushList = () => {
    if (!listType || listItems.length === 0) return
    const listKey = `${listType}-${nodes.length}`
    const listChildren = listItems.map((item, index) => (
      <li key={`${listKey}-item-${index}`}>{renderInlineMarkdown(item, `${listKey}-${index}`)}</li>
    ))
    nodes.push(
      listType === 'ul' ? (
        <ul key={listKey}>{listChildren}</ul>
      ) : (
        <ol key={listKey}>{listChildren}</ol>
      )
    )
    listType = null
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const ulMatch = line.match(/^-\s+(.+)$/)
    const olMatch = line.match(/^\d+\.\s+(.+)$/)

    if (ulMatch || olMatch) {
      flushParagraph()
      const nextType: 'ul' | 'ol' = ulMatch ? 'ul' : 'ol'
      if (listType && listType !== nextType) {
        flushList()
      }
      listType = nextType
      listItems.push((ulMatch?.[1] || olMatch?.[1] || '').trim())
      continue
    }

    flushList()
    paragraphBuffer.push(line)
  }

  flushParagraph()
  flushList()

  return nodes.length > 0 ? nodes : <p>No description provided.</p>
}

export function buildCampaignDescriptionPreviewText(markdown?: string | null): string {
  const source = (markdown || '').trim()
  if (!source) return 'No description provided.'
  return source
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\*\*|\*/g, '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
