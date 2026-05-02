export type RouteView =
  | { kind: 'app' }
  | { kind: 'join'; inviteCode: string }
  | { kind: 'watch'; inviteCode: string }
  | { kind: 'browse' }

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

  return { kind: 'app' }
}
