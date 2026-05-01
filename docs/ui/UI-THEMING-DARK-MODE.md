# **UI-THEMING-DARK-MODE.md**

_Authoritative specification for dark mode behaviour in VTT‑Chat._

---

## 1. Overview

Dark mode is the **primary** visual mode of VTT‑Chat.

Light mode exists for accessibility and daylight readability, but the UI is fundamentally designed around:

- Low‑chroma surfaces
- High‑contrast text
- Subtle elevation
- Tactical command‑centre feel

This document defines:

- How dark mode works
- How tokens behave
- How components adapt
- How persona accents behave
- How motion interacts with dark mode
- Accessibility rules for contrast and reduced‑motion

---

## 2. Dark Mode Philosophy

Dark mode in VTT‑Chat is:

### **2.1 Tactical**

Inspired by cockpit UIs, not neon gamer UIs.

### **2.2 Low‑glare**

Designed for long sessions on multi‑monitor setups.

### **2.3 High‑contrast**

Text is always readable, even on low‑quality displays.

### **2.4 Subtle**

No gradients, no glowing backgrounds, no high‑saturation colors.

### **2.5 Token‑driven**

All colors come from CSS variables — never hardcoded.

---

## 3. Dark Mode Token Set

Dark mode is the **default** token set:

```css
:root {
  --bg-app: #05070a;
  --bg-surface: #0c1016;
  --bg-surface-alt: #111722;
  --bg-elevated: #151c29;

  --border-subtle: #1f2933;
  --border-strong: #2b3a4a;

  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;
  --text-inverse: #020617;

  --accent-primary: #3b82f6;
  --accent-primary-soft: rgba(59, 130, 246, 0.12);

  --accent-warning: #f97316;
  --accent-error: #ef4444;
  --accent-success: #22c55e;

  --accent-dm: #f97316;
  --accent-player: #22c55e;
  --accent-spectator: #a855f7;
}
```

These tokens are **never modified** by components.

---

## 4. Light Mode Overrides

Light mode is activated via:

```html
<html data-theme="light"></html>
```

Overrides:

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

### **4.1 What does NOT change in light mode**

- Persona accents
- Accent-primary
- Accent-warning / error / success
- Motion
- Layout
- Component structure

---

## 5. Component Behaviour in Dark Mode

Below is the **component‑level behaviour** for dark mode.

---

### **5.1 Toolbar**

- Background: `--bg-surface-alt`
- Icons: `--text-primary`
- Connection dot: accent tokens

Dark mode emphasizes **status visibility**.

---

### **5.2 CampaignInfo**

- Background: `--bg-surface`
- Text: `--text-primary`
- Secondary text: `--text-secondary`

Dark mode reduces glare by using **soft contrast** between surfaces.

---

### **5.3 SystemToasts**

- Background: `--bg-elevated`
- Border: `--border-strong`
- Text: `--text-primary`

Dark mode toasts must be **high contrast** but not bright.

---

### **5.4 LeftRail (Player List)**

- Background: `--bg-surface`
- Hover: `--accent-primary-soft`
- Speaking ring: `--accent-primary`

Dark mode emphasizes **player activity** without bright colors.

---

### **5.5 ChatWindow**

- Background: `--bg-surface`
- Own message tint: `--accent-primary-soft`
- Other messages: `--border-subtle`

Dark mode keeps chat readable without harsh whites.

---

### **5.6 MessageBubble**

- Own message border: `--accent-player`
- Timestamp: `--text-muted`

Dark mode ensures timestamps are visible but unobtrusive.

---

### **5.7 NoteCard**

- Border-left: `--accent-primary`
- Visibility badges use persona accents

Dark mode makes note cards stand out without overpowering chat.

---

### **5.8 NotesPanel**

- Background: `--bg-elevated`
- Hover: `--accent-primary-soft`

Dark mode uses elevation to separate panels.

---

### **5.9 RightTabBar**

- Background: `--bg-surface-alt`
- Active tab border: `--accent-primary`

Dark mode keeps tabs subtle but clear.

---

### **5.10 SlideInPanels**

- Background: `--bg-elevated`
- Border-left: `--border-strong`

Dark mode uses elevation + border to define panel boundaries.

---

## 6. Persona Accent Behaviour in Dark Mode

Persona accents remain the same in dark mode:

| Persona   | Accent Token         | Usage                         |
| --------- | -------------------- | ----------------------------- |
| DM        | `--accent-dm`        | Overrides, labels, DM-only UI |
| Player    | `--accent-player`    | Own messages, IC mode         |
| Spectator | `--accent-spectator` | Spectator mode label          |

### **6.1 Accents must never be used for backgrounds**

Only for:

- Borders
- Icons
- Labels
- Small highlights

This prevents neon‑gamer aesthetics.

---

## 7. Motion in Dark Mode

Motion rules are identical in light/dark mode.

### **7.1 Motion must never brighten surfaces**

No color transitions.

### **7.2 Motion uses opacity + transform only**

- Slide
- Fade
- Scale

### **7.3 Glow effects use low‑alpha accents**

Example:

```css
box-shadow: 0 0 6px rgba(var(--accent-primary), 0.25);
```

DM Voice Bar uses slightly stronger glow.

---

## 8. Accessibility in Dark Mode

### **8.1 Minimum contrast**

- Text vs background: **WCAG AA**
- Icons vs background: **WCAG AA**

### **8.2 Reduced motion**

When `prefers-reduced-motion: reduce`:

- No pulsing
- No glowing
- No animated transitions
- Only instant state changes

### **8.3 Color‑blind safety**

- No red/green‑only indicators
- All status colors paired with icons

---

## 9. Implementation Rules

### **9.1 Never use raw hex values**

Only tokens.

### **9.2 Never use opacity on text tokens**

Use `--text-muted` instead.

### **9.3 Never use persona accents for large surfaces**

Only micro‑accents.

### **9.4 Never animate color tokens**

Only opacity/transform.

### **9.5 Theme switching is atomic**

One attribute:

```html
<html data-theme="dark"></html>
```

No per‑component theme logic.

---

## 10. Summary

This document defines:

- Dark mode philosophy
- Token behaviour
- Component‑level theming
- Persona accent rules
- Motion rules
- Accessibility constraints
- Implementation rules

It is the authoritative reference for dark mode in VTT‑Chat.
