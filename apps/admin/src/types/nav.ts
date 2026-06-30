/** All navigable admin pages. */
export type AdminPage = 'dashboard' | 'campaigns' | 'users' | 'settings' | 'logs'

/** Navigation sidebar entry. */
export interface NavItem {
  key: AdminPage
  label: string
  subtitle: string
}
