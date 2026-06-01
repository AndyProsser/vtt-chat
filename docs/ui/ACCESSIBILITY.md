# Accessibility Guide

## Purpose

This document defines the baseline accessibility contract for workspace UI surfaces and tracks the W4-UX-Polish implementation scope.

## Standards

- Target standard: WCAG 2.2 AA
- Input modes: keyboard, mouse, touch, and assistive technologies
- Motion: respect OS-level reduced-motion preference
- Theme parity: light and dark must provide equivalent readability and affordances

## Baseline Requirements

### Keyboard and Focus

- All interactive controls must be reachable by keyboard.
- Focus order must follow visual reading order.
- Every interactive element must expose a visible focus state via `:focus-visible`.
- Dialogs and popovers must trap focus while open and restore focus on close.

### Semantic Structure and Labels

- Use semantic elements (`button`, `input`, `label`, `section`, `nav`) over generic wrappers.
- Icon-only controls must have deterministic `aria-label` values.
- Decorative icons must be marked `aria-hidden="true"`.
- Dynamic status text must use appropriate landmarks or roles (`status`, `alert`, `dialog`).

### Color and Contrast

- Text and icon contrast must satisfy WCAG AA against their backgrounds.
- Hover/focus/selected states must not rely on color alone.
- Shared tokens in theme styles must define both light and dark values.

### Reduced Motion

- All animation and transition-heavy surfaces must respect `prefers-reduced-motion: reduce`.
- Reduced-motion mode must not hide content or block required interactions.
- Motion should degrade to immediate state transitions where practical.

### Responsive Accessibility

- Supported breakpoints: `<680px`, `680-1080px`, `>=1080px`.
- No horizontal scroll at viewport widths within supported ranges.
- Critical controls must remain visible and operable at each breakpoint.

## Verification Checklist

Use this checklist before closing accessibility-related work:

- [ ] Full keyboard pass on Lobby, Session, and Editor workspaces.
- [ ] Screen-reader spot checks for dialogs, toasts, tabs, and icon-only controls.
- [ ] Reduced-motion pass with OS preference enabled.
- [ ] Theme parity pass (light and dark) on all critical paths.
- [ ] Responsive checks at `<680px`, `680-1080px`, and `>=1080px`.

## Current W4 Implementation Notes (2026-06-01)

- Global focus-visible ring baseline is defined in `frontend/src/styles/components/session/theme.css`.
- Global reduced-motion baseline is defined in `frontend/src/styles/components/session/theme.css`.
- Dedicated accessibility guidance doc is now present at `docs/ui/ACCESSIBILITY.md`.

## Follow-up Work

- Add automated accessibility checks to CI (axe-based smoke pass for critical routes).
- Add targeted keyboard navigation tests for right-rail tabs and session toolbar controls.
- Add contrast snapshots for theme token regressions.
