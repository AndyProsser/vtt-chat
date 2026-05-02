/** All navigable admin pages. */
export type AdminPage =
  | 'dashboard'
  | 'analytics'
  | 'users'
  | 'campaigns'
  | 'status'
  | 'logs'
  | 'settings'
  | 'integrations'

/** Navigation sidebar entry. */
export interface NavItem {
  key: AdminPage
  label: string
}
