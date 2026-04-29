# **AI-CONTEXT-DESIGN-CHANGES.md**

### _Authoritative design + architecture context for GitHub Copilot_

This document defines the **design system**, **UI architecture**, **component patterns**, and **implementation rules** for the VTT‑Chat project.
It also defines how GitHub Copilot must interpret, maintain, and evolve the design system.

This file is authoritative.
Copilot must always consult this file before making UI, component, or architectural changes.

---

# **1. Project Overview**

## **1.1 Purpose**

VTT‑Chat is a **persona‑aware communication layer** for virtual tabletop platforms.
It provides:

- DM‑focused command‑centre UI
- Player‑focused chat and interaction UI
- Spectator‑safe read‑only UI
- A separate admin panel for configuration, billing, and management

The core UI is **lightweight, minimalistic, token‑driven, and persona‑aware**.

The admin panel is **MUI‑based**, structured, and operational.

---

# **2. Architecture Overview**

## **2.1 Core Technologies**

- **React** (functional components, hooks)
- **Vite** (build system)
- **Zustand** (state management)
- **Radix UI** (headless primitives for core UI)
- **Tailwind CSS** (utility‑first styling)
- **CSS Variables** (design tokens)
- **MUI** (admin panel only)

## **2.2 UI Split**

| Area                              | Technology                   | Notes                                       |
| --------------------------------- | ---------------------------- | ------------------------------------------- |
| **Core UI (DM/Player/Spectator)** | Radix UI + Tailwind + Tokens | No MUI allowed                              |
| **Admin Panel**                   | MUI                          | No Radix/Tailwind unless explicitly allowed |
| **Shared Logic**                  | Zustand + Hooks              | No UI dependencies                          |

## **2.3 Folder Structure**

The project uses separate frontend and admin applications.
The target structure must respect that split instead of introducing a shared `src/admin/` inside the frontend app.

```text
frontend/src/
  core-ui/          # Radix + Tailwind wrapper components
  personas/         # DM, Player, Spectator UI providers and wrappers
  state/            # Zustand stores
  tokens/           # CSS variables, token exports, theme utilities
  components/       # Feature components composed from core-ui
  hooks/            # Shared hooks
  utils/            # Non-UI utilities

admin/src/
  components/       # MUI-based reusable admin components
  features/         # Admin feature modules
  pages/            # Route-level admin screens
  theme.ts          # Custom MUI theme
  utils/            # Non-UI utilities
```

Migration to this structure should be incremental.
Feature folders may continue to exist during the transition as long as import boundaries remain clear.

---

# **3. Design System**

## **3.1 Token Philosophy**

All styling must be derived from **design tokens**, not arbitrary values.

Tokens include:

- Colors
- Spacing
- Typography
- Radii
- Shadows
- Motion
- Persona accents
- Light/dark mode variants

Tokens are implemented as **CSS variables** and mapped into Tailwind via the config.

## **3.2 Light/Dark Mode**

- Target end state: controlled via a root class (`.light` / `.dark`)
- During migration, existing `prefers-color-scheme` token definitions may remain until the root-class theme controller is implemented
- Tokens must switch automatically once the root theme controller is in place
- No hardcoded colors in migrated UI

## **3.3 Persona Accents**

Each persona has accent tokens:

- `--accent-dm-*`
- `--accent-player-*`
- `--accent-spectator-*`

Components must apply accents via persona wrappers, not inline logic.

---

# **4. Radix UI Integration Rules**

## **4.1 Allowed Radix Components**

- Dialog
- Popover
- DropdownMenu
- Tooltip
- Tabs
- Accordion
- HoverCard
- ScrollArea
- Separator
- Switch
- Slider

## **4.2 Wrapping Pattern**

Every adopted Radix primitive must be wrapped in a project-specific component before use in feature code:

```
core-ui/
  dialog/
    Dialog.tsx
    DialogTrigger.tsx
    DialogContent.tsx
```

## **4.3 Styling Rules**

- All styling via Tailwind + tokens
- No Radix styling props
- No inline styles unless dynamic
- No arbitrary values

## **4.4 Accessibility**

Radix handles accessibility; wrappers must not break it.

---

# **5. Tailwind Usage Rules**

## **5.1 Utility Rules**

- Use Tailwind utilities for layout, spacing, flex, grid, typography
- Use tokens for colors, radii, shadows, motion
- Do not use arbitrary values (`[12px]`) unless absolutely necessary

## **5.2 Class Ordering**

Follow Tailwind’s recommended order:

```
layout → box → typography → visual → states → modifiers
```

## **5.3 Component Classes**

Use component classes when:

- The pattern repeats
- The component has persona variants
- The component has multiple states

---

# **6. Component Patterns**

## **6.1 Component Template**

Every core UI wrapper component should follow this structure:

```
import { cn } from "@/utils/cn";
import * as Radix from "@radix-ui/react-<component>";

export function ComponentName({ className, ...props }) {
  return (
    <Radix.Root
      {...props}
      className={cn(
        "base-styles-using-tokens",
        className
      )}
    />
  );
}
```

## **6.2 Persona Wrappers**

Persona logic must be applied via:

```
<PersonaProvider persona="dm">
  <Component />
</PersonaProvider>
```

Not inside the component.

---

# **7. Admin Panel (MUI) Rules**

## **7.1 Isolation**

Admin panel must remain fully isolated:

- No Radix
- No Tailwind
- No persona logic
- No token‑based styling unless explicitly bridged

## **7.2 MUI Theme**

Admin panel uses a custom MUI theme defined in:

```
admin/src/theme.ts
```

## **7.3 Component Rules**

- Use MUI components directly
- Use MUI system for spacing, layout, and styling
- Do not import core UI components into admin

---

# **8. Migration Rules (Old UI → New UI)**

## **8.1 Replace old components with Radix wrappers**

Any component using:

- custom popovers
- custom dialogs
- custom dropdowns
- custom modals
- custom tooltips

must be migrated to Radix equivalents.

## **8.2 Replace inline styles with tokens**

Any hardcoded:

- colors
- spacing
- radii
- shadows
- transitions

- must be replaced with tokens and framework-appropriate styling primitives.
- Dynamic inline styles may remain when they are driven by runtime values and cannot be expressed safely through tokens or component props.

## **8.3 Replace legacy CSS with Tailwind**

Legacy `.css` or `.scss` files in the frontend should be phased out as Tailwind-based equivalents land.
Do not remove existing stylesheets until the replacement UI has shipped and been verified.

## **8.4 Admin UI must migrate to MUI**

Any admin-related UI in the separate `admin` application using custom components must be replaced with MUI equivalents.
Admin migration should be page-by-page to avoid mixing framework adoption, layout rewrites, and feature refactors in a single change.

## **8.5 Migration sequencing**

Changes should land in this order:

1. Align docs and migration rules
2. Add framework infrastructure using current stable package releases only
3. Normalize tokens and theme handling
4. Add wrapper/component layers
5. Migrate feature surfaces incrementally
6. Remove deprecated CSS and component paths only after replacement verification

## **8.6 Migration deliverables**

The migration program should be delivered as explicit work packages.

### **Deliverable D1 — Spec Alignment**

- Design-system docs aligned to the current multi-app repository structure
- Migration rules updated to require current stable package releases only
- Theme migration path clarified from `prefers-color-scheme` to root theme classes
- Roadmap and implementation docs updated to reference the new UI migration track

### **Deliverable D2 — Framework Foundations**

- Frontend has Tailwind and PostCSS configured
- Frontend has initial Radix wrapper folders and utility helpers
- Admin has MUI installed and `admin/src/theme.ts` created
- Import boundaries are documented so frontend core UI and admin UI remain isolated

### **Deliverable D3 — Token and Theme Normalization**

- Existing frontend CSS variables are normalized into the target token contract
- Tailwind theme mappings point to token-backed CSS variables
- Admin theme tokens are represented in the MUI theme
- Root theme class support is added without regressing current light/dark behavior

### **Deliverable D4 — Primitive and Shell Migration**

- Core Radix wrappers exist for the approved primitive set actually used by the app
- Frontend shell/app-frame surfaces stop relying on hardcoded inline styles
- Auth and entry surfaces use the new tokenized styling path
- Admin shell layout, theme provider, and baseline controls are MUI-based

### **Deliverable D5 — Feature Surface Migration**

- High-use frontend surfaces are migrated incrementally: command center, notes, chat, audio, room controls
- Admin pages are migrated page-by-page to MUI components
- Persona-aware styling is applied through wrappers/providers instead of inline branching in reusable primitives

### **Deliverable D6 — Cleanup and Enforcement**

- Obsolete frontend CSS files are removed only after replacement verification
- Deprecated custom admin controls are removed only after MUI replacements land
- Docs, tests, and contributor guidance reflect the new framework split
- Verification gates exist for architecture boundaries, accessibility, and theme behavior

## **8.7 Acceptance criteria**

Each deliverable is complete only when all relevant criteria below are met.

### **D1 Acceptance Criteria**

- No design doc instructs contributors to create a shared `src/admin/` inside the frontend app
- All file-location references match the current repository layout
- The migration order is documented consistently across design and roadmap docs

### **D2 Acceptance Criteria**

- Frontend installs and builds with Tailwind/PostCSS enabled
- Admin installs and builds with MUI enabled
- Only current stable package releases are introduced
- No feature behavior changes are required to land the framework setup

### **D3 Acceptance Criteria**

- Frontend token definitions are source-of-truth driven and mapped into Tailwind
- Admin theme values are defined through MUI theme configuration rather than ad hoc CSS drift
- Light and dark theme behavior remains stable before and after theme-controller introduction

### **D4 Acceptance Criteria**

- Adopted Radix primitives are only consumed through project wrappers
- Frontend shell and auth surfaces no longer depend on non-dynamic hardcoded inline styles
- Admin shell renders through MUI theme/provider infrastructure
- Accessibility behavior for focus, keyboard navigation, and announcements is preserved

### **D5 Acceptance Criteria**

- Migrated frontend features use tokens plus Tailwind or wrapper primitives instead of legacy CSS-first implementations
- Migrated admin pages use MUI layout and form primitives instead of custom CSS-only controls
- Persona-specific accents are applied without embedding persona logic inside shared primitive components

### **D6 Acceptance Criteria**

- Removed CSS/components have verified replacements in runtime and tests
- Architecture rules are enforceable by code review and contributor guidance
- Documentation references the current framework split and migration status accurately

---

# **9. Copilot Behaviour Rules**

## **9.1 Always consult this file first**

Before making any UI or architectural change.

## **9.2 Always generate DESIGN-SYSTEM-CHANGES.md**

Whenever:

- This file changes
- Any design doc changes
- Any UI architecture changes

## **9.3 Never mix technologies**

- No MUI in core UI
- No Radix/Tailwind in admin
- No persona logic in admin

## **9.4 Ask for clarification when uncertain**

Especially before:

- Removing components
- Renaming files
- Reorganizing folders
- Changing token definitions
- Replacing working CSS with framework code when there is no verified equivalent yet

---

# **10. Document Location**

This file must remain at:

```
docs/changes/AI-CONTEXT-DESIGN-CHANGES.md
```

The change‑tracking file must remain at:

```
docs/changes/DESIGN-SYSTEM-CHANGES.md
```
