export type AppShellRoom = {
  id: string
  sessionId: string
  type: 'MAIN' | 'GROUP' | 'PRIVATE'
}

export type AppShellStoreState = {
  currentSessionId?: string
  rooms: Record<string, Record<string, AppShellRoom>>
}
