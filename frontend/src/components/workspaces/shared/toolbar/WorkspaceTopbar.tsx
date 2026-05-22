import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { Icon } from '@/components/ui/Icon'
import type { WorkspaceTopbarProps } from './workspaceTopbar.types'

export function WorkspaceTopbar({
  className,
  dataTestId,
  dataUiComponent,
  dataUiState,
  brandAriaLabel = 'App brand',
  centerContent,
  extraActions,
  themeMode,
  onToggleTheme,
  onOpenUserSettings,
  onExit,
  exitAriaLabel,
  exitTooltipLabel,
  connectionStatusColorKey,
  connectionStatusLabel,
  connectionStatusRows,
}: WorkspaceTopbarProps) {
  const resolvedClassName = ['session-toolbar', className].filter(Boolean).join(' ')

  return (
    <div
      className={resolvedClassName}
      data-testid={dataTestId}
      data-ui-component={dataUiComponent}
      data-ui-state={dataUiState}
    >
      <div className="session-toolbar__zone session-toolbar__zone--left">
        <div className="session-toolbar__brand" aria-label={brandAriaLabel}>
          <span className="session-toolbar__brand-mark" aria-hidden="true">
            <img src="/branding/app-logo.png" alt="" className="session-toolbar__brand-logo" />
          </span>
          <strong className="session-toolbar__brand-title">VTT Chat</strong>
        </div>
      </div>

      {centerContent ? (
        <div className="session-toolbar__zone session-toolbar__zone--center">{centerContent}</div>
      ) : null}

      <div className="session-toolbar__zone session-toolbar__zone--right">
        {extraActions ? (
          <>
            <div className="session-toolbar__extra-buttons">{extraActions}</div>
            <span className="session-toolbar__separator" aria-hidden="true" />
          </>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleTheme}
              className="session-toolbar__icon-btn"
              aria-label="Theme"
            >
              <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Theme
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onOpenUserSettings}
              className="session-toolbar__icon-btn"
              aria-label="Settings"
            >
              <Icon name="settings" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            Settings
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onExit}
              className="session-toolbar__icon-btn session-toolbar__icon-btn--exit"
              aria-label={exitAriaLabel}
            >
              <Icon name="logout" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="end">
            {exitTooltipLabel}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="session-toolbar__connection"
              data-status-color={connectionStatusColorKey}
              aria-label={`Connection: ${connectionStatusLabel}`}
              role="status"
            >
              <span className="session-toolbar__connection-dot" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="end"
            className="session-toolbar__tooltip-content--status"
          >
            <div className="session-toolbar__status-tooltip-title">Status</div>
            {connectionStatusRows.map((row) => (
              <div
                key={`${row.label}-${row.value}`}
                className="session-toolbar__status-tooltip-row"
              >
                <span>{row.label}</span>
                <strong className={row.toneClassName}>{row.value}</strong>
              </div>
            ))}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
