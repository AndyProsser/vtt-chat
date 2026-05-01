# **UI-THEMING-GUIDELINES.md**

_Practical implementation rules for applying the VTT‑Chat theme system._

---

## 1. Overview

This document explains **how to apply the VTT‑Chat theming system** in code.

It covers:

- How to use CSS tokens
- How to structure component styles
- How to apply persona accents
- How to implement light/dark mode
- How to avoid anti‑patterns
- How to keep the theme deterministic and maintainable

This is the authoritative implementation guide for engineers.

---

## 2. Core Principles

### **2.1 Tokens only — never raw colors**

All colors must come from CSS variables:

```css
var(--bg-surface)
var(--text-primary)
var(--accent-primary)
```

No hex values.
No RGB values.
No inline styles.

### **2.2 Components never define their own palette**

All color decisions come from:

- `UI-THEMING.md`
- `UI-THEMING-COMPONENT-TOKENS.md`

### **2.3 Light/dark mode is a single attribute**

No per‑component theme logic.

```html
<html data-theme="dark">
  <html data-theme="light"></html>
</html>
```

### **2.4 Persona accents are micro‑accents**

Never used for backgrounds or large surfaces.

### **2.5 Theming must be deterministic**

Same state → same colors → same behaviour.

---

## 3. File Structure

Recommended structure:

```text
/src/styles/
  tokens.css
  theme-dark.css
  theme-light.css
  components/
    toolbar.css
    player-list.css
    chat.css
    notes.css
    panels.css
```

### **3.1 tokens.css**

Contains the **base token set** (dark mode defaults).

### **3.2 theme-light.css**

Contains only **overrides**.

### **3.3 Component CSS files**

Contain **no colors** — only token references.

---

## 4. Applying Tokens in CSS

### **4.1 Backgrounds**

```css
background-color: var(--bg-surface);
```

#### **4.2 Borders**

```css
border-color: var(--border-subtle);
```

### **4.3 Text**

```css
color: var(--text-primary);
```

### **4.4 Accents**

```css
border-left: 2px solid var(--accent-primary);
```

### **4.5 Persona accents**

```css
&.dm {
  color: var(--accent-dm);
}

&.player {
  color: var(--accent-player);
}
```

### **4.6 Hover states**

```css
&:hover {
  background-color: var(--accent-primary-soft);
}
```

### **4.7 Disabled states**

```css
opacity: 0.5;
color: var(--text-muted);
pointer-events: none;
```

---

## 5. Applying Tokens in React Components

### **5.1 Using CSS modules**

```tsx
<div className={styles.toolbar}>…</div>
```

```css
/* toolbar.module.css */
.toolbar {
  background: var(--bg-surface-alt);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
}
```

### **5.2 Using styled-components (optional)**

```tsx
const Panel = styled.div`
  background: var(--bg-elevated);
  border-left: 1px solid var(--border-strong);
  color: var(--text-primary);
`
```

### **5.3 Using Tailwind with CSS variables**

If using Tailwind, define custom colors:

```css
:root {
  --color-bg: var(--bg-surface);
}
```

Then:

```html
<div class="bg-[var(--bg-surface)] text-[var(--text-primary)]"></div>
```

---

## 6. Persona Accent Guidelines

Persona accents must be:

- Subtle
- Non‑dominant
- Used only for micro‑accents

### **Allowed uses**

- Borders
- Icons
- Labels
- Small indicators
- Whisper target highlight
- DM‑only override icons

### **Not allowed**

- Backgrounds
- Full panels
- Large surfaces
- Chat bubbles
- Notes backgrounds

### **Examples**

```css
.dm-label {
  color: var(--accent-dm);
}

.player-self {
  border-left: 2px solid var(--accent-player);
}
```

---

## 7. Dark Mode Implementation

Dark mode is the **default** token set.

### **7.1 No component-level dark mode logic**

Never do:

```css
[data-theme='dark'] .component { … }
```

### **7.2 Dark mode is purely token-driven**

All dark mode behaviour comes from:

```text
tokens.css
```

---

## 8. Light Mode Implementation

Light mode is a **token override layer**.

### **8.1 Activate via attribute**

```html
<html data-theme="light"></html>
```

### **8.2 Override only tokens**

```css
:root[data-theme='light'] {
  --bg-surface: #ffffff;
  --text-primary: #020617;
}
```

### **8.3 Never override component CSS**

Components must not contain:

```css
[data-theme='light'] .component { … }
```

---

## 9. Accessibility Guidelines

### **9.1 Minimum contrast**

All text must meet **WCAG AA**.

### **9.2 Reduced motion**

When `prefers-reduced-motion: reduce`:

- No pulsing
- No glowing
- No animated transitions

### **9.3 Color-blind safety**

Never rely on color alone.

Use:

- Icons
- Labels
- Shapes

---

## 10. Anti‑Patterns (Do Not Do)

### **10.1 Hardcoded colors**

❌ `color: #fff;`
❌ `background: #000;`

### **10.2 Inline styles**

❌ `<div style={{ color: '#fff' }}>`

### **10.3 Component-level theme logic**

❌ `if (theme === 'dark') { … }`

### **10.4 Persona accents as backgrounds**

❌ `background: var(--accent-player);`

### **10.5 Using opacity to dim text**

❌ `opacity: 0.5;`
Use `--text-muted` instead.

---

## 11. Summary

This document defines:

- How to apply tokens
- How to structure CSS
- How to integrate with React
- How to apply persona accents
- How to implement light/dark mode
- How to avoid anti‑patterns
- How to keep theming deterministic

It is the authoritative implementation guide for the VTT‑Chat theme system.
