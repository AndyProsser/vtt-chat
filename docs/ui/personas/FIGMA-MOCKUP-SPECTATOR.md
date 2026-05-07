# **SPECTATOR PERSONA — FIGMA‑READY MOCKUP (FULL SPEC)**

_Read‑only. Zero interaction. Maximum visibility._

Viewport mode set for Spectator mockups:

- **Minimalist Mobile**: `<=767px`
- **Balanced Player**: `768px-1279px`
- **DM Desktop Command**: `>=1280px` (spectator opt-in)

Spectator mode policy:

- Spectator remains read-only in all modes.
- Desktop Command opt-in affects layout only, not permissions.

---

## 1. **Frame Specification**

### **1.1 Root Frame**

| Property   | Value                      |
| ---------- | -------------------------- |
| Name       | `Spectator Persona — Main` |
| Width      | 1920px                     |
| Height     | 1080px                     |
| Layout     | Vertical stack             |
| Padding    | 0                          |
| Spacing    | 0                          |
| Background | `var(--bg-app)`            |

### **1.2 Mode Variant Frames**

Create three linked variant frames in Figma:

1. `Spectator Persona — Minimalist Mobile`
2. `Spectator Persona — Balanced Player`
3. `Spectator Persona — Desktop Command (Opt-in)`

Variant behavior:

- Minimalist Mobile: chat-first, compact left controls, bottom tool dock for read-only panels.
- Balanced Player: default spectator shell and reduced interaction model.
- Desktop Command opt-in: one right panel can remain pinned open for passive monitoring.

---

## 2. **Top Regions**

### **2.1 Toolbar**

Spectator sees a simplified toolbar.

| Property      | Value                            |
| ------------- | -------------------------------- |
| Height        | 48px                             |
| Background    | `var(--bg-surface-alt)`          |
| Border bottom | `1px solid var(--border-subtle)` |
| Layout        | Horizontal, space‑between        |
| Padding       | 0 16px                           |

#### **Toolbar Components**

- **Left:** Campaign Name
- **Center:** Session Timer
- **Right:** Connection Indicator only

Spectator does **not** see:

- Theme toggle
- Menu
- DM tools
- Player tools

---

## 3. **Main Layout (2 Columns)**

Balanced baseline spectator shell:

- Right rail hidden.
- Composer hidden.
- Whisper unavailable.
- Interaction remains read-only.

The layout becomes **Left Rail + Center Pane**, maximizing visibility.

Mode adaptation note:

- Minimalist Mobile uses compact left controls and bottom tool docking.
- Balanced Player preserves default read-only density.
- Desktop Command opt-in may add a pinned right panel for read-only tools.

---

### **3.1 Left Rail — Player List**

| Property   | Value               |
| ---------- | ------------------- |
| Width      | 240px               |
| Background | `var(--bg-surface)` |
| Layout     | Vertical            |
| Padding    | 8px 0               |
| Scroll     | Yes                 |

#### **Groups Section**

- Spectator sees **all groups**, but cannot interact
- No hover states
- No right‑click menus
- No DM‑only overrides

#### **Player Item**

| Element       | Spec                    |
| ------------- | ----------------------- |
| Height        | 40px                    |
| Avatar        | 32px                    |
| Speaking Ring | `var(--accent-primary)` |
| Mute Icon     | `var(--accent-error)`   |
| Hover         | **none** (read‑only)    |
| Right‑click   | **disabled**            |

#### **Spectator‑Only Behaviour**

- Player list is **always expanded**
- No collapse button
- No Manage Players button

---

### **3.2 Center Pane — Chat Only (Read‑Only)**

| Property   | Value           |
| ---------- | --------------- |
| Width      | flex‑1          |
| Background | `var(--bg-app)` |
| Layout     | Vertical        |

#### **Group Header**

| Property   | Value                    |
| ---------- | ------------------------ |
| Height     | 48px                     |
| Background | `var(--bg-surface)`      |
| Padding    | 0 16px                   |
| Content    | Group Name + Environment |

Spectator sees the environment but cannot change it.

---

#### **Chat Window**

| Property        | Value               |
| --------------- | ------------------- |
| Background      | `var(--bg-surface)` |
| Scroll          | Yes                 |
| Padding         | 16px                |
| Message Spacing | 12px                |

##### **Message Types (Spectator Persona)**

| Type           | Visible? | Notes                     |
| -------------- | -------- | ------------------------- |
| Player Message | ✔        | Standard border           |
| DM Message     | ✔        | Border-left `--accent-dm` |
| System Message | ✔        | Secondary text            |
| Note Card      | ✔        | Opens popout (read‑only)  |

Spectator sees **everything visible to the group**, but cannot interact.

---

#### **Composer**

❌ **Not visible**
Spectator cannot send messages.

---

## 4. **Right Rail**

Balanced baseline:

- Spectator right rail remains hidden to maximize chat width.

Mode variants:

- Minimalist Mobile: tool icons can appear in bottom dock for read-only utility views.
- Desktop Command opt-in: right icon rail may be shown with read-only panels.

---

## 5. **Right Panel (Slide‑In Panels)**

Panel permissions remain read-only in all modes.

Mode variants:

- Minimalist Mobile: read-only utility views open as bottom popovers.
- Balanced Player: read-only utility views can open as popout/slide-in surfaces when enabled.
- Desktop Command opt-in: one read-only panel can stay pinned open.

---

## 6. **Z‑Index Hierarchy**

Simplified version:

| Layer        | z-index |
| ------------ | ------- |
| Toasts       | 1000    |
| Popouts      | 900     |
| Right Panel  | 800     |
| Right Rail   | 700     |
| Toolbar      | 500     |
| Main Content | 100     |

No DM Voice Bar.
No composer.

---

## 7. **Auto‑Layout Rules**

### **Toolbar**

- Horizontal
- Space-between

### **Left Rail**

- Vertical
- Scrollable

### **Center Pane**

- Vertical
- Chat grows
- No composer

---

## 8. **Motion & Interaction Overlays**

Spectator has **reduced motion** by default.

### **Allowed**

- Fade‑in of messages
- Smooth scrolling

### **Disabled**

- Slide‑in panels
- Hover animations
- Press animations
- Drag‑drop
- Whisper animations
- Popout slide‑in (optional: fade only)

### **Note Popout (if enabled)**

```text
opacity: 0 → 1
duration: 120ms
no transform
```

---

## 9. **Component Naming (Figma‑Ready)**

- `Frame / Spectator Persona`
- `Component / Toolbar`
- `Component / Left Rail`
- `Component / Player Item`
- `Component / Group Item`
- `Component / Center Pane`
- `Component / Chat Message`
- `Component / Note Card`
- `Component / Note Popout (Read‑Only)`

Balanced baseline hides right rail/panel; mode variants may surface read-only tool panels.
Composer remains hidden.
DM Voice Bar remains hidden.

---

## **Spectator Persona Figma‑Ready Mockup Complete**

This is the **cleanest**, **most visibility‑optimized**, and **strictly read‑only** persona in your system.

It is fully aligned with:

- DM Persona master spec
- Player Persona spec
- Persona visibility rules
- Token system
- Motion system
- UI architecture
