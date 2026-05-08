# Tooltip/Popper Styling Contract

Purpose: keep all tooltip/popper surfaces visually consistent across the frontend and prevent regressions where overlays render with generic or transparent defaults.

## Single Source Of Truth

- Base tooltip/popper skin lives in [frontend/src/core-ui/tooltip/Tooltip.tsx](../frontend/src/core-ui/tooltip/Tooltip.tsx) and [frontend/src/styles/core-ui/Tooltip.css](../frontend/src/styles/core-ui/Tooltip.css).
- All standard tooltip poppers must use `TooltipContent` without a skin class override.

## Contract Rules

1. Use `Tooltip`, `TooltipTrigger`, and `TooltipContent` from core-ui.
2. Do not apply feature-specific background/border/typography tooltip classes.
3. If a tooltip needs layout-only specialization, add a narrow class that changes layout only:
   - allowed: width, max-width, internal row/grid layout, extra spacing for content blocks
   - not allowed: background, border, radius, text color, base font-size, base font-weight
4. For status-style tooltips, use extension classes that only add layout details (example: min-width and extra vertical padding), not skin.
5. Keep arrow styling coupled to base tooltip skin via `.app-tooltip-arrow`.
6. For non-Tooltip poppers (custom panels like radial panels), match the same visual token values as the base tooltip skin unless there is an explicit product exception.

## Visual Baseline

- Background: `#111827`
- Text: `#f8fafc`
- Border: `1px solid rgba(148, 163, 184, 0.25)`
- Radius: `0.5rem`
- Padding: `0.35rem 0.5rem`
- Typography: `0.7rem`, `600`

## Grep Checklist

Run these before merging tooltip/popper UI changes:

1. `rg "TooltipContent" frontend/src/components`
2. `rg "session-toolbar__tooltip-content|command-center-right-rail-tooltip" frontend/src`
3. `rg "app-tooltip-content|app-tooltip-arrow" frontend/src`

Expected outcomes:

- No remaining feature-level skin classes (`session-toolbar__tooltip-content`, `command-center-right-rail-tooltip`).
- Exactly one shared base skin (`app-tooltip-content` / `app-tooltip-arrow`).
- Any remaining custom tooltip classes are layout-only extensions.

## Current Approved Exceptions

- `session-toolbar__tooltip-content--status`: layout-only status content extension.
- `room-selector-profile-tooltip`: max-width/layout-only profile tooltip extension.
