import type { HTMLAttributes } from 'react'

type IconName =
  | 'search'
  | 'journal'
  | 'history'
  | 'settings'
  | 'close'
  | 'storefront'
  | 'voice'
  | 'rooms'
  | 'users'
  | 'edit'
  | 'mic'
  | 'panel'
  | 'chat'
  | 'notes'
  | 'play'
  | 'pause'
  | 'stop'
  | 'timer'
  | 'hourglass'
  | 'rocket_launch'
  | 'moon'
  | 'sun'
  | 'signal'
  | 'logout'
  | 'arrow_back'
  | 'north'
  | 'south'
  | 'send'
  | 'menu_book'
  | 'chevron_left'
  | 'chevron_right'
  | 'keyboard_double_arrow_left'
  | 'keyboard_double_arrow_right'
  | 'book_2'
  | 'status'
  | 'mic_off'
  | 'effects'
  | 'overrides'
  | 'party'
  | 'inventory'
  | 'restart_alt'
  | 'money_bag'
  | 'currency_exchange'
  | 'receipt_long'
  | 'swap_horiz'
  | 'move_item'

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
  edit: 'edit',
  mic: 'mic',
  panel: 'dashboard',
  chat: 'chat',
  notes: 'notes',
  play: 'play_arrow',
  pause: 'pause',
  stop: 'stop',
  timer: 'timer',
  hourglass: 'hourglass_top',
  rocket_launch: 'rocket_launch',
  moon: 'dark_mode',
  sun: 'light_mode',
  signal: 'signal_cellular_alt',
  logout: 'logout',
  arrow_back: 'arrow_back',
  north: 'north',
  south: 'south',
  send: 'send',
  menu_book: 'menu_book',
  chevron_left: 'chevron_left',
  chevron_right: 'chevron_right',
  keyboard_double_arrow_left: 'keyboard_double_arrow_left',
  keyboard_double_arrow_right: 'keyboard_double_arrow_right',
  book_2: 'book_2',
  status: 'circle',
  mic_off: 'mic_off',
  effects: 'tune',
  overrides: 'supervisor_account',
  party: 'groups',
  inventory: 'inventory_2',
  restart_alt: 'restart_alt',
  money_bag: 'money_bag',
  currency_exchange: 'currency_exchange',
  receipt_long: 'receipt_long',
  swap_horiz: 'swap_horiz',
  storefront: 'storefront',
  move_item: 'move_item',
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
