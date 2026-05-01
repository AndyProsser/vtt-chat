# **UI-THEMING-LIGHT-MODE.md**

_Authoritative specification for light mode behaviour in VTT‑Chat._

---

## 1. Overview

Light mode exists for:

- Daylight readability
- Accessibility
- Multi‑monitor setups with bright ambient light
- Users who prefer light UIs for long reading sessions

Light mode is **not** a redesign.
It is a **token override layer** applied on top of the same component structure, motion, and persona accents.

Dark mode is the **primary** design.
Light mode is the **alternate palette**.

---

## 2. Light Mode Philosophy

Light mode in VTT‑Chat is:

### **2.1 Neutral**

No bright whites, no harsh contrast spikes.

### **2.2 Low‑glare**

Surfaces are soft, slightly warm, and easy on the eyes.

### **2.3 High‑readability**

Text contrast is maintained at WCAG AA or better.

### **2.4 Minimalist**

No gradients, no shadows that feel “material”, no skeuomorphism.

### **2.5 Token‑driven**

Only token overrides — no component‑level overrides.

---

## 3. Light Mode Token Overrides

Light mode is activated via:

```html
<html data-theme="light"></html>
```

### **3.1 Backgrounds**

```css
:root[data-theme='light'] {
  --bg-app: #f3f4f6; /* soft grey */
  --bg-surface: #ffffff; /* clean white */
  --bg-surface-alt: #e5e7eb; /* light grey */
  --bg-elevated: #ffffff; /* flat white */
}
```

### **3.2 Borders**

```css
--border-subtle: #d1d5db;
--border-strong: #9ca3af;
```

### **3.3 Text**

```css
--text-primary: #020617; /* near-black */
--text-secondary: #4b5563; /* slate grey */
--text-muted: #6b7280; /* muted slate */
--text-inverse: #f9fafb; /* for badges */
```

### **3.4 Accents**

Only one accent token changes:

```css
--accent-primary-soft: rgba(37, 99, 235, 0.08);
```

All other accent tokens remain identical to dark mode.

### **3.5 Persona accents**

**Never change.**

- `--accent-dm`
- `--accent-player`
- `--accent-spectator`

These remain stable across themes for identity consistency.

---

## 4. Component Behaviour in Light Mode

Below is the **component‑level behaviour** for light mode.

---

### **4.1 Toolbar**

- Background: `--bg-surface-alt`
- Icons: `--text-primary`
- Connection dot: accent tokens (unchanged)

Light mode keeps the toolbar clean and unobtrusive.

---

### **4.2 CampaignInfo**

- Background: `--bg-surface`
- Text: `--text-primary`
- Secondary text: `--text-secondary`

Light mode prioritizes clarity and readability.

---

### **4.3 SystemToasts**

- Background: `--bg-elevated`
- Border: `--border-strong`
- Text: `--text-primary`

Toasts remain subtle and non‑intrusive.

---

### **4.4 LeftRail (Player List)**

- Background: `--bg-surface`
- Hover: `--accent-primary-soft`
- Speaking ring: `--accent-primary`

Light mode keeps the rail clean and bright without glare.

---

### **4.5 ChatWindow**

- Background: `--bg-surface`
- Own message tint: `--accent-primary-soft`
- Other messages: `--border-subtle`

Light mode ensures chat remains readable and calm.

---

### **4.6 MessageBubble**

- Own message border: `--accent-player`
- Timestamp: `--text-muted`

Light mode uses soft greys for metadata.

---

### **4.7 NoteCard**

- Border-left: `--accent-primary`
- Visibility badges use persona accents

Light mode keeps note cards visually distinct without heavy contrast.

---

### **4.8 NotesPanel**

- Background: `--bg-elevated`
- Hover: `--accent-primary-soft`

Light mode uses elevation to separate content.

---

### **4.9 RightTabBar**

- Background: `--bg-surface-alt`
- Active tab border: `--accent-primary`

Light mode keeps tabs crisp and readable.

---

### **4.10 SlideInPanels**

- Background: `--bg-elevated`
- Border-left: `--border-strong`

Light mode uses subtle borders to define panel edges.

---

## 5. Persona Accent Behaviour in Light Mode

Persona accents behave **identically** to dark mode.

| Persona   | Accent Token         | Usage                         |
| --------- | -------------------- | ----------------------------- |
| DM        | `--accent-dm`        | Overrides, labels, DM-only UI |
| Player    | `--accent-player`    | Own messages, IC mode         |
| Spectator | `--accent-spectator` | Spectator mode label          |

### **5.1 Accents remain micro‑accents**

They are never used for:

- Backgrounds
- Large surfaces
- Full‑width components

This preserves the command‑centre aesthetic.

---

## 6. Motion in Light Mode

Motion rules are identical to dark mode:

- No color transitions
- Only opacity + transform
- No glowing backgrounds
- No high‑contrast flashes

### **6.1 Glow effects**

Glow uses the same accent tokens but with **lower opacity** in light mode to avoid halo artifacts.

---

## 7. Accessibility in Light Mode

### **7.1 Minimum contrast**

- Text vs background: **WCAG AA**
- Icons vs background: **WCAG AA**

### **7.2 Reduced motion**

Same behaviour as dark mode:

- No pulsing
- No glowing
- No animated transitions

### **7.3 Color‑blind safety**

- No red/green‑only indicators
- All status colors paired with icons

---

## 8. Implementation Rules

### **8.1 Light mode is a token override only**

No component‑level overrides.

### **8.2 Never use raw hex values**

Only tokens.

### **8.3 Theme switching is atomic**

One attribute:

```html
<html data-theme="light"></html>
```

### **8.4 No layout changes**

Light mode must not shift or resize components.

### **8.5 No persona accent changes**

Accents remain stable across themes.

---

## 9. Summary

This document defines:

- Light mode philosophy
- Token overrides
- Component‑level behaviour
- Persona accent rules
- Motion rules
- Accessibility constraints
- Implementation rules

It is the authoritative reference for light mode in VTT‑Chat.
