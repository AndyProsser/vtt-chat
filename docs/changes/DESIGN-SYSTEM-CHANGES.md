Here is your **initial, production‑ready `DESIGN-SYSTEM-CHANGES.md`**, aligned with the Modify AI Context rules and ready for GitHub Copilot to use as the authoritative change‑tracking log.

It is intentionally minimal, structured, and ready to expand as Copilot begins making updates.

---

# **DESIGN-SYSTEM-CHANGES.md**

### _Authoritative change‑tracking log for design system, architecture, and UI implementation_

This document records **all changes** to the design system, AI context, UI architecture, component patterns, tokens, and implementation rules.
It also defines the **required code changes**, **migration steps**, and **verification checklists** associated with each update.

Copilot must update this file **whenever**:

- AI-CONTEXT-DESIGN-CHANGES.md changes
- Any design document changes
- Any UI architecture changes
- Any component patterns change
- Any token definitions change
- Any persona rules change
- Any admin/MUI rules change

This file is authoritative.

---

# **0. Initial Version — Baseline State**

This section establishes the baseline before any automated changes occur.

## **0.1 Summary**

The project is transitioning to a **dual‑UI architecture**:

- **Core UI:** Radix UI + Tailwind + Design Tokens
- **Admin UI:** MUI (Material UI)
- **Persona‑aware UI:** DM, Player, Spectator
- **Token‑driven design system**
- **Zustand for state**
- **React + Vite**

This initial version captures the starting point before Copilot begins applying migrations.

---

# **1. Summary of Context Changes**

This section lists changes made to the design system or AI context.

### **1.1 Added**

- Introduced Radix UI as the core UI primitive layer
- Introduced Tailwind as the styling layer for core UI
- Introduced MUI as the exclusive admin UI framework
- Added persona‑aware design rules
- Added token‑driven styling rules
- Added component wrapping patterns for Radix
- Added migration rules for legacy components
- Added admin/core UI separation rules

### **1.2 Updated**

- Updated architecture to enforce strict separation between admin and core UI
- Updated component patterns to use Radix wrappers
- Updated styling rules to use Tailwind + tokens
- Updated persona logic to use wrapper providers

### **1.3 Deprecated**

- Deprecated custom modal/popover/dialog implementations
- Deprecated inline styles
- Deprecated arbitrary Tailwind values
- Deprecated legacy CSS/SCSS files
- Deprecated mixing admin and core UI components

---

# **2. Required Code Changes**

This section defines the code changes Copilot must apply to align the implementation with the updated design system.

## **2.1 Component-Level Changes**

- Replace all custom dialogs with Radix `<Dialog>` wrappers
- Replace all custom popovers with Radix `<Popover>` wrappers
- Replace all custom dropdowns with Radix `<DropdownMenu>` wrappers
- Replace all custom tooltips with Radix `<Tooltip>` wrappers
- Replace any custom tab system with Radix `<Tabs>`
- Replace any custom accordions with Radix `<Accordion>`
- Replace any custom switches/sliders with Radix equivalents

## **2.2 File-Level Changes**

- Move all core UI components into `src/core-ui/`
- Move all admin UI components into `src/admin/`
- Move persona wrappers into `src/personas/`
- Move token definitions into `src/tokens/`
- Remove legacy CSS/SCSS files unless layout‑critical

## **2.3 Pattern-Level Changes**

- Replace inline styles with Tailwind + tokens
- Replace arbitrary Tailwind values with token‑mapped utilities
- Replace custom animations with token‑based motion rules
- Replace persona logic inside components with persona providers

## **2.4 Token-Level Changes**

- Ensure all colors use `--color-*` tokens
- Ensure all spacing uses `--space-*` tokens
- Ensure all radii use `--radius-*` tokens
- Ensure all shadows use `--shadow-*` tokens
- Ensure all motion uses `--motion-*` tokens
- Ensure persona accents use `--accent-<persona>-*` tokens

---

# **3. Migration Steps**

This section defines the ordered steps Copilot must follow when applying changes.

## **3.1 Step 1 — Identify Legacy Components**

Search for:

- custom modals
- custom popovers
- custom dropdowns
- custom tooltips
- custom tabs
- custom accordions
- inline styles
- arbitrary Tailwind values
- legacy CSS files

## **3.2 Step 2 — Replace with Radix Wrappers**

For each legacy component:

- Replace with Radix primitive
- Wrap in project‑specific component
- Apply Tailwind + tokens
- Remove legacy implementation

### **Before**

```tsx
<div className="modal">...</div>
```

### **After**

```tsx
<Dialog>
  <DialogTrigger>...</DialogTrigger>
  <DialogContent>...</DialogContent>
</Dialog>
```

## **3.3 Step 3 — Apply Tokens**

Replace:

- `#fff` → `var(--color-bg-surface)`
- `8px` → `var(--space-2)`
- `border-radius: 4px` → `var(--radius-sm)`

## **3.4 Step 4 — Migrate Admin UI to MUI**

Replace:

- custom forms → MUI `<TextField>`, `<Select>`, `<FormControl>`
- custom tables → MUI `<DataGrid>` or `<Table>`
- custom layouts → MUI `<Box>` and `<Grid>`

## **3.5 Step 5 — Remove Deprecated Files**

- Remove unused CSS
- Remove unused components
- Remove duplicated patterns

---

# **4. Verification Checklist**

Copilot must verify the following after applying changes.

## **4.1 UI Verification**

- Light mode works
- Dark mode works
- Persona accents apply correctly
- Layouts remain stable
- No visual regressions

## **4.2 Behaviour Verification**

- Radix components behave correctly
- Focus management works
- Keyboard navigation works
- Accessibility attributes remain intact

## **4.3 Architecture Verification**

- No MUI in core UI
- No Radix/Tailwind in admin
- No persona logic inside components
- No inline styles
- No arbitrary Tailwind values

## **4.4 Code Quality Verification**

- Components follow the standard template
- Zustand stores remain UI‑agnostic
- No unused imports
- No dead code

---

# **5. Next Steps**

This initial version establishes the baseline.
Future updates will append new sections under:

- **1. Summary of Context Changes**
- **2. Required Code Changes**
- **3. Migration Steps**
- **4. Verification Checklist**

Copilot must maintain this file as the project evolves.
