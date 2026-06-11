export const ADMIN_USERS_DEFAULT_LIST_PAGE = 1
export const ADMIN_USERS_DEFAULT_LIST_PAGE_SIZE = 25
export const ADMIN_USERS_MAX_LIST_PAGE_SIZE = 200

export const ADMIN_USERS_ROLE_FILTERS = ['all', 'dm', 'player', 'spectator', 'admin'] as const

export const ADMIN_USERS_STATUS_FILTERS = ['all', 'active', 'suspended', 'banned'] as const

export const ADMIN_USERS_DEFAULT_EXPORT_FORMAT = 'json'

export const ADMIN_USERS_IMPORT_PREVIEW_MAX_ROWS = 500
export const ADMIN_USERS_IMPORT_PREVIEW_MIN_USERNAME_LENGTH = 2
export const ADMIN_USERS_IMPORT_PREVIEW_DEFAULT_ROLE = 'PLAYER'

export const ADMIN_USERS_EXPORT_CSV_HEADERS = [
  'id',
  'username',
  'email',
  'displayName',
  'role',
  'adminRole',
  'isActive',
  'createdAt',
  'updatedAt',
] as const
