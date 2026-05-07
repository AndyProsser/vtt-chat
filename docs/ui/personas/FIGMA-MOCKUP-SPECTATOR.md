# **SPECTATOR PERSONA — FIGMA‑READY MOCKUP (FULL SPEC)**

_Read‑only. Zero interaction. Maximum visibility._

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

Spectator does **not** get the right rail.
Spectator does **not** get the composer.
Spectator does **not** get whisper.
Spectator does **not** get any interaction.

The layout becomes **Left Rail + Center Pane**, maximizing visibility.

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

❌ **Not visible**
Spectator has no tabs and no slide‑in panels.

This maximizes center‑pane visibility.

---

## 5. **Right Panel (Slide‑In Panels)**

❌ **Never appears**
Spectator cannot open any panels.

---

## 6. **Z‑Index Hierarchy**

Simplified version:

| Layer        | z-index |
| ------------ | ------- |
| Toasts       | 1000    |
| Popouts      | 900     |
| Toolbar      | 500     |
| Main Content | 100     |

No right rail.
No right panel.
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

No right rail.
No right panel.
No composer.
No DM Voice Bar.

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
