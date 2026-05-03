export type RouteView =
  | { kind: 'app' }
  | { kind: 'join'; inviteCode: string }
  | { kind: 'watch'; inviteCode: string }
  | { kind: 'browse' }
  | { kind: 'campaign-settings'; campaignId: string }

export function resolveRoute(pathname: string): RouteView {
  const joinMatch = pathname.match(/^\/join\/([^/]+)$/)
  if (joinMatch) {
    return {
      kind: 'join',
      inviteCode: decodeURIComponent(joinMatch[1] || '').trim(),
    }
  }

  const watchMatch = pathname.match(/^\/watch\/([^/]+)$/)
  if (watchMatch) {
    return {
      kind: 'watch',
      inviteCode: decodeURIComponent(watchMatch[1] || '').trim(),
    }
  }

  if (pathname === '/browse') {
    return { kind: 'browse' }
  }

  const campaignSettingsMatch = pathname.match(/^\/campaigns\/([^/]+)\/settings$/)
  if (campaignSettingsMatch) {
    return {
      kind: 'campaign-settings',
      campaignId: decodeURIComponent(campaignSettingsMatch[1] || '').trim(),
    }
  }

  return { kind: 'app' }
}
