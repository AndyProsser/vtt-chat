/**
 * CommandHelpPopover
 * The [/] icon button left of the chat textarea.
 * Opens a role-aware command reference popover listing all available commands,
 * their syntax, and a usage example.
 */

import { memo } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { ChatCommandDefinition, Role } from '@shared'
import { getCommandsForRole } from '@/utils/chatCommandParser'

interface CommandHelpPopoverProps {
  role: Role | string
  onInsert?: (slash: string) => void
}

interface CommandTableRowProps {
  cmd: ChatCommandDefinition
  onInsert?: (slash: string) => void
}

function CommandTableRow({ cmd, onInsert }: CommandTableRowProps) {
  return (
    <tr className="chat-command-help__row">
      <td className="chat-command-help__cell chat-command-help__cell--slash">
        {onInsert ? (
          <button
            type="button"
            className="chat-command-help__insert-btn"
            onClick={() => onInsert(cmd.slash + ' ')}
            title={`Insert ${cmd.slash}`}
          >
            {cmd.slash}
          </button>
        ) : (
          <span className="chat-command-help__slash">{cmd.slash}</span>
        )}
      </td>
      <td className="chat-command-help__cell chat-command-help__cell--syntax">
        <code className="chat-command-help__syntax">{cmd.syntax}</code>
      </td>
      <td className="chat-command-help__cell chat-command-help__cell--description">
        {cmd.description}
      </td>
      <td className="chat-command-help__cell chat-command-help__cell--example">
        <code className="chat-command-help__example">{cmd.example}</code>
      </td>
    </tr>
  )
}

function CommandHelpPopoverComponent({ role, onInsert }: CommandHelpPopoverProps) {
  const commands = getCommandsForRole(role)

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="chat-command-help__trigger"
          aria-label="Chat commands reference"
          title="Chat commands"
        >
          <span className="chat-command-help__trigger-label">/</span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="chat-command-help__popover"
          side="top"
          align="start"
          sideOffset={6}
        >
          <div className="chat-command-help__header">
            <span className="chat-command-help__title">Chat Commands</span>
            <Popover.Close className="chat-command-help__close" aria-label="Close">
              <span className="material-symbols-outlined" aria-hidden="true">close</span>
            </Popover.Close>
          </div>

          {commands.length === 0 ? (
            <p className="chat-command-help__empty">No commands available in your current role.</p>
          ) : (
            <table className="chat-command-help__table">
              <thead>
                <tr>
                  <th className="chat-command-help__th">Command</th>
                  <th className="chat-command-help__th">Syntax</th>
                  <th className="chat-command-help__th">Description</th>
                  <th className="chat-command-help__th">Example</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <CommandTableRow key={cmd.name} cmd={cmd} onInsert={onInsert} />
                ))}
              </tbody>
            </table>
          )}

          <Popover.Arrow className="chat-command-help__arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export const CommandHelpPopover = memo(CommandHelpPopoverComponent)
