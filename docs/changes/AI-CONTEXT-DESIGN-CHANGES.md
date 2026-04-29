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

```
src/
  core-ui/          # Radix + Tailwind components
  admin/            # MUI components
  personas/         # DM, Player, Spectator logic + UI wrappers
  state/            # Zustand stores
  tokens/           # CSS variables, theme definitions
  components/       # Shared wrappers, utilities
  hooks/            # Shared hooks
  utils/            # Non-UI utilities
```

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

- Controlled via a root class (`.light` / `.dark`)
- Tokens must switch automatically
- No hardcoded colors

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

Every Radix primitive must be wrapped in a project‑specific component:

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

Every component must follow this structure:

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
admin/theme.ts
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

must be replaced with tokens.

## **8.3 Replace legacy CSS with Tailwind**

Legacy `.css` or `.scss` files must be removed unless layout‑critical.

## **8.4 Admin UI must migrate to MUI**

Any admin‑related UI using custom components must be replaced with MUI equivalents.

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

---

# **10. Document Location**

This file must remain at:

```
AI-CONTEXT-DESIGN-CHANGES.md
```

The change‑tracking file must remain at:

```
DESIGN-SYSTEM-CHANGES.md
```
