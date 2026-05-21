import type { HTMLAttributes } from 'react'

type IconName =
  | 'search'
  | 'journal'
  | 'history'
  | 'settings'
  | 'close'
  | 'voice'
  | 'rooms'
  | 'users'
  | 'mic'
  | 'panel'
  | 'chat'
  | 'notes'
  | 'play'
  | 'pause'
  | 'stop'
  | 'timer'
  | 'moon'
  | 'sun'
  | 'signal'
  | 'logout'
  | 'status'
  | 'mic_off'
  | 'effects'
  | 'overrides'
  | 'party'

interface IconProps extends HTMLAttributes<HTMLSpanElement> {
  name: IconName
}

const MATERIAL_SYMBOLS: Record<IconName, string> = {
  search: 'search',
  journal: 'menu_book',
  history: 'history',
  settings: 'settings',
  close: 'close',
  voice: 'graphic_eq',
  rooms: 'view_list',
  users: 'group',
  mic: 'mic',
  panel: 'dashboard',
  chat: 'chat',
  notes: 'notes',
  play: 'play_arrow',
  pause: 'pause',
  stop: 'stop',
  timer: 'timer',
  moon: 'dark_mode',
  sun: 'light_mode',
  signal: 'signal_cellular_alt',
  logout: 'logout',
  status: 'circle',
  mic_off: 'mic_off',
  effects: 'tune',
  overrides: 'supervisor_account',
  party: 'groups',
}

export function Icon({ name, className = '', ...props }: IconProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={`material-symbols-outlined ui-icon ${className}`.trim()}
    >
      {MATERIAL_SYMBOLS[name]}
    </span>
  )
}
