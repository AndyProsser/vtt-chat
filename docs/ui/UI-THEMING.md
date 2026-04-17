# **UI-THEMING.md**

_Authoritative theming and color system for VTT‑Chat._

---

## 1. Goals

**VTT‑Chat theming must:**

- **Complement D&D Beyond / VTT maps**, not compete with them
- Feel like a **tactical command centre**, not a game UI
- Stay **legible for long sessions** on multi‑monitor setups
- Respect **persona accents** (DM / Player / Spectator)
- Support **light / dark** modes with the same token set
- Be **CSS‑token driven**, not component‑local colors

The same token model also applies to the Admin SPA; see [ADMIN-UI-DESIGN.md](ADMIN-UI-DESIGN.md)
for admin-specific layout and interaction guidance.

---

## 2. Design language

**Overall feel:**

- Neutral, low‑chroma base
- Accents used sparingly (status, role, focus)
- High contrast for text and critical controls
- Subtle shadows, no neon, no gradients

**Hierarchy:**

- Background → Surface → Accent
- Left rail (players) and center (chat) are primary
- Right rail (tools) is secondary

---

## 3. Color tokens

All colors are defined as **CSS custom properties** and consumed via tokens, not raw values.

### 3.1 Base tokens

```css
:root {
  /* Backgrounds */
  --bg-app: #05070a;
  --bg-surface: #0c1016;
  --bg-surface-alt: #111722;
  --bg-elevated: #151c29;

  /* Borders */
  --border-subtle: #1f2933;
  --border-strong: #2b3a4a;

  /* Text */
  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --text-inverse: #020617;

  /* Accents (neutral) */
  --accent-primary: #3b82f6;
  --accent-primary-soft: rgba(59, 130, 246, 0.12);
  --accent-warning: #f97316;
  --accent-error: #ef4444;
  --accent-success: #22c55e;
}
```

### 3.2 Light mode overrides

```css
:root[data-theme='light'] {
  --bg-app: #f3f4f6;
  --bg-surface: #ffffff;
  --bg-surface-alt: #e5e7eb;
  --bg-elevated: #ffffff;

  --border-subtle: #d1d5db;
  --border-strong: #9ca3af;

  --text-primary: #020617;
  --text-secondary: #4b5563;
  --text-muted: #6b7280;
  --text-inverse: #f9fafb;

  --accent-primary-soft: rgba(37, 99, 235, 0.08);
}
```

---

## 4. Persona accents

Persona accents are **subtle**, used for highlights and labels—not full surfaces.

```css
:root {
  --accent-dm: #f97316; /* amber/orange */
  --accent-player: #22c55e; /* green */
  --accent-spectator: #a855f7; /* purple */
}
```

**Usage:**

- DM: small badges, DM‑only controls, DM label in top bar
- Player: self‑indicator, IC toggle, own messages accent
- Spectator: “Spectator Mode” label only

No persona gets a fully recolored UI.

---

## 5. Component theming

### 5.1 Toolbar

- Background: `--bg-surface-alt`
- Border bottom: `--border-subtle`
- Connection status dot:
  - Connected: `--accent-success`
  - Connecting: `--accent-warning`
  - Disconnected: `--accent-error`

### 5.2 Campaign info + toasts

- Campaign strip: `--bg-surface`
- Toast background: `--bg-elevated`
- Toast border: `--border-strong`
- Toast text: `--text-primary`
- Toast level accents:
  - info: `--accent-primary`
  - warning: `--accent-warning`
  - error: `--accent-error`

### 5.3 Left rail (players)

- Background: `--bg-surface`
- Section headers: `--text-muted`
- Player hover: `--accent-primary-soft`
- Speaking indicator: `--accent-primary` ring
- Mute icon: `--accent-error`

DM‑only overrides use `--accent-dm` for small affordances (icons, labels).

### 5.4 Center pane (chat + notes)

- Background: `--bg-app`
- Chat surface: `--bg-surface`
- Own messages:
  - Border: `--accent-player`
  - Subtle background tint using `--accent-primary-soft`
- System messages:
  - Text: `--text-secondary`
  - Left border: `--border-strong`
- Note cards:
  - Left border: `--accent-primary`
  - Visibility badge:
    - DM‑only: `--accent-dm`
    - Party: `--accent-player`
    - Global: `--accent-primary`

### 5.5 Right rail (tabs + panels)

- Tabs background: `--bg-surface-alt`
- Active tab:
  - Border-left: `--accent-primary`
  - Text: `--text-primary`
- Panels: `--bg-elevated`, `--border-subtle`

---

## 6. States & feedback

### 6.1 Focus

- Outline: `2px solid var(--accent-primary)`
- No glow for Spectator reduced‑motion mode.

### 6.2 Hover

- Background: `--accent-primary-soft`
- Text remains `--text-primary` or `--text-secondary`.

### 6.3 Disabled

- Text: `--text-muted`
- Background: `transparent`
- No hover styles.

---

## 7. Integration with motion

- Accent glows use `--accent-primary` with low‑alpha shadows.
- DM Voice Bar “Clear All” uses `--accent-error` glow.
- Speaking pulses use `--accent-primary` at low opacity.

No color is ever animated between unrelated hues—only opacity and brightness.

---

## 8. Theming API surface

At the component level, **only tokens** are used:

- `var(--bg-*)`
- `var(--text-*)`
- `var(--border-*)`
- `var(--accent-*)`

Theme switching is **one attribute**:

```ts
// React-ish
<html data-theme={theme}> … </html>
```

No component owns its own palette.

---

## 9. Accessibility constraints

- Minimum contrast: **WCAG AA** for all text
- Never use color alone to indicate state (icons + labels + color)
- Spectator + reduced‑motion: no glowing, no pulsing, no high‑chroma accents
