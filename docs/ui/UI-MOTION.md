# **UI-MOTION.md**

_A unified motion specification for all UI components in VTT‑Chat._

---

## 1. Overview

VTT‑Chat uses a **single, unified motion language** across all personas.

Motion must be:

- **Fast** (120–200ms)
- **Subtle**
- **Meaningful**
- **Non‑blocking**
- **Persona‑weighted** (DM heavier, Player lighter, Spectator minimal)

All animations reinforce the command‑centre aesthetic and never distract from gameplay.

This file defines:

- Global easing curves
- Component‑specific motion rules
- Persona‑specific weighting
- Motion constraints

---

## 2. Global Motion Principles

### **2.1 Motion communicates intent**

Every animation answers:
**“Why did this change?”**

### **2.2 Motion is fast**

- Standard transitions: **120–200ms**
- No long easing curves
- No bounce, wobble, or playful motion

### **2.3 Motion is subtle**

- Micro‑interactions
- Soft easing
- Minimal displacement

### **2.4 Motion reinforces hierarchy**

- Panels slide
- Rails shift
- Chat stays anchored
- DM controls feel heavier

### **2.5 Motion feels physical**

- Slight inertia
- Slight overshoot on drag
- Snap‑to‑place interactions

---

## 3. Easing Curves

These are the **only** curves used across the UI.

### **Primary UI Easing**

```text
cubic-bezier(0.25, 0.1, 0.25, 1.0)
```

Used for:

- Slide‑in panels
- Rails
- Tabs
- Pop‑outs

### **Micro‑interaction Easing**

```text
cubic-bezier(0.33, 0.0, 0.67, 1.0)
```

Used for:

- Buttons
- Toggles
- Hover states

### **Drag‑and‑drop Easing**

```text
cubic-bezier(0.2, 0.0, 0.0, 1.0)
```

Used for:

- Player drag
- Drop targets

---

## 4. Component‑Specific Motion

This section defines the motion rules for every UI component.

---

## 4.1 Toolbar

### **Connection Status Pulse**

```text
Duration: 160ms
Opacity: 0.6 → 1.0
```

### **Theme Toggle**

```text
Duration: 120ms
Scale: 1.0 → 0.96 → 1.0
```

---

## 4.2 Campaign Info + Toasts

### **System Toasts (Dismissable)**

```text
Duration: 140ms
Transform: translateY(-6px) → 0
Opacity: 0 → 1
Easing: primary
```

### **Toast Dismiss**

```text
Duration: 120ms
Opacity: 1 → 0
Transform: translateY(0) → -6px
```

---

## 4.3 Left Rail (Player List)

### **Collapse → Expand**

```text
Duration: 180ms
Width: 64px → 240px
Opacity (text): 0 → 1
Avatar scale: 0.9 → 1.0
```

### **Expand → Collapse**

```text
Duration: 160ms
Width: 240px → 64px
Opacity (text): 1 → 0
Avatar scale: 1.0 → 0.9
```

### **Player Item Hover**

```text
Duration: 80ms
Background: darken by 4%
Scale: 1.0 → 1.02
```

### **Speaking Indicator Pulse**

```text
Duration: 900ms
Opacity: 0.4 → 1.0 → 0.4
Easing: ease-in-out
```

---

## 4.4 Center Pane

### **Group Header**

Minimal fade on group change:

```text
Duration: 120ms
Opacity: 0 → 1
```

### **Chat / Notes Toggle**

```text
Duration: 120ms
Transform: translateY(-4px) → 0
Opacity: 0 → 1
```

### **Chat Message Entry**

```text
Duration: 120ms
Transform: translateY(6px) → 0
Opacity: 0 → 1
Easing: micro
```

### **Note Card Entry**

```text
Duration: 160ms
Border-left accent: fade in
Background: slight pulse (2% brightness)
```

### **Message Composer Focus**

```text
Duration: 120ms
Border: 1px → 2px (accent)
Shadow: subtle glow
```

---

## 4.5 Right Panel (Tabs + Slide‑In Panels)

### **Tab Select**

```text
Duration: 120ms
Transform: scale(0.96) → 1.0
Opacity: 0.8 → 1.0
```

### **Slide‑In Panel (Open)**

```text
Duration: 180ms
Easing: primary
Transform: translateX(100%) → 0
Opacity: 0.85 → 1
Shadow: fade in (0 → 12px blur)
```

### **Slide‑In Panel (Close)**

```text
Duration: 140ms
Transform: translateX(0) → 100%
Opacity: 1 → 0.85
Shadow: fade out
```

### **Chat Shift (When Panel Opens)**

```text
Duration: 180ms
Transform: translateX(0 → -panelWidth)
```

---

## 4.6 Note Pop‑Out Window

### **Open**

```text
Duration: 180ms
Transform: translateX(100%) → 0
Opacity: 0.85 → 1
Easing: primary
```

### **Close**

```text
Duration: 140ms
Transform: translateX(0) → 100%
Opacity: 1 → 0.85
```

---

## 4.7 DM Voice Bar (DM Only)

### **Open**

```text
Duration: 140ms
Transform: translateY(-8px) → 0
Opacity: 0 → 1
```

### **Preset Button Press**

```text
Duration: 80ms
Scale: 1.0 → 0.96 → 1.0
Glow: 0 → 1 (blue)
```

### **Clear All**

```text
Duration: 120ms
Flash: red glow 0 → 1 → 0
```

---

## 4.8 Drag‑and‑Drop (DM Only)

### **Pickup**

```text
Duration: 80ms
Scale: 1.0 → 1.05
Shadow: 0 → 12px blur
```

### **Drag**

```text
Cursor: grab
Transform follows pointer with 1–2px inertia
```

### **Drop Target Highlight**

```text
Duration: 120ms
Background: accent glow (blue)
Border: 1px → 2px
```

### **Drop Countdown**

```text
Duration: 200ms each number
Scale: 1.0 → 1.1 → 1.0
Opacity: 0 → 1 → 0
```

---

## 4.9 Environment Change (Group)

### **Icon Update**

```text
Duration: 160ms
Scale: 0.8 → 1.0
Opacity: 0 → 1
```

### **Group Background Pulse**

```text
Duration: 200ms
Background: darken by 4% → normal
```

---

## 5. Persona‑Specific Motion Weighting

| Persona       | Motion Weighting                                                    |
| ------------- | ------------------------------------------------------------------- |
| **DM**        | Heavier shadows, slightly slower transitions (180ms), stronger glow |
| **Player**    | Lighter shadows, faster transitions (160ms), softer glow            |
| **Spectator** | No glow, no scale animations, reduced motion                        |

Spectator mode prioritizes **accessibility** and **read‑only clarity**.

---

## 6. Summary

This motion spec:

- Matches your existing animation document
- Integrates with the updated UI layout
- Applies persona‑specific weighting
- Defines motion for every component
- Respects all prompting rules
- Introduces no new behaviour

It is the authoritative motion reference for the VTT‑Chat UI.
