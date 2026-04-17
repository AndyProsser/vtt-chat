# 🎨 **DM PERSONA — FIGMA‑READY MOCKUP (FULL SPEC)**

_All values are implementation‑grade and token‑driven._

---

# 1. **Frame Specification**

## **1.1 Root Frame**

| Property   | Value               |
| ---------- | ------------------- |
| Name       | `DM Persona — Main` |
| Width      | 1920px              |
| Height     | 1080px              |
| Layout     | Vertical stack      |
| Padding    | 0                   |
| Spacing    | 0                   |
| Background | `var(--bg-app)`     |

---

# 2. **Top Regions**

## **2.1 Toolbar**

| Property      | Value                                     |
| ------------- | ----------------------------------------- |
| Height        | **48px**                                  |
| Width         | 100%                                      |
| Background    | `var(--bg-surface-alt)`                   |
| Border bottom | `1px solid var(--border-subtle)`          |
| Layout        | Horizontal, space‑between, center‑aligned |
| Padding       | 0 16px                                    |

### **Toolbar Components**

- **Left:** Campaign Name (text-primary, 16px semibold)
- **Center:** Session Timer (text-secondary, 14px)
- **Right:**
  - Connection Indicator (8px circle, accent-success/error/warning)
  - Theme Toggle
  - Menu Button

---

## **2.2 DM Voice Bar**

| Property   | Value                    |
| ---------- | ------------------------ |
| Height     | **56px**                 |
| Background | `var(--bg-elevated)`     |
| Layout     | Horizontal, left‑aligned |
| Padding    | 0 16px                   |
| Spacing    | 12px                     |

### **Voice Bar Components**

- **Preset Buttons (ALL visible)**
  - Height: 32px
  - Padding: 8px 12px
  - Background: `var(--bg-surface)`
  - Border: `1px solid var(--border-subtle)`
  - Text: `var(--text-primary)`
  - Hover: `var(--accent-primary-soft)`
- **Push‑to‑Talk Button**
  - 32px height
  - Accent glow on active
- **Clear All**
  - Text color: `var(--accent-error)`
  - Hover: subtle error glow

---

# 3. **Main Layout (3 Columns)**

## **3.1 Left Rail — Player List**

| Property   | Value                              |
| ---------- | ---------------------------------- |
| Width      | **240px expanded**, 64px collapsed |
| Background | `var(--bg-surface)`                |
| Layout     | Vertical                           |
| Padding    | 8px 0                              |
| Scroll     | Yes                                |

### **Left Rail Components**

#### **Rooms Section**

- Section Header: text-muted, 12px uppercase
- Room Item:
  - Height: 28px
  - Text: text-secondary
  - Player Count: text-muted

#### **Player Item**

- Height: **40px**
- Avatar: 32px
- Speaking Ring: `var(--accent-primary)`
- Mute Icon: `var(--accent-error)`
- Hover: `var(--accent-primary-soft)`
- Right‑click menu: Condition / Distance

#### **Manage Players Button**

- Height: 32px
- Background: `var(--bg-surface-alt)`
- Border: `var(--border-subtle)`
- Opens Player Management Panel

---

## **3.2 Center Pane — Chat Only**

| Property   | Value           |
| ---------- | --------------- |
| Width      | flex‑1          |
| Background | `var(--bg-app)` |
| Layout     | Vertical        |
| Padding    | 0               |

### **Room Header**

| Property   | Value                   |
| ---------- | ----------------------- |
| Height     | 48px                    |
| Background | `var(--bg-surface)`     |
| Layout     | Horizontal              |
| Padding    | 0 16px                  |
| Content    | Room Name + Environment |

### **Chat Window**

| Property        | Value               |
| --------------- | ------------------- |
| Background      | `var(--bg-surface)` |
| Scroll          | Yes                 |
| Padding         | 16px                |
| Message Spacing | 12px                |

#### **Message Types**

- **Player Message**
  - Border-left: 2px solid `var(--accent-player)`
  - Background: `var(--bg-surface)`
- **DM Message**
  - Border-left: 2px solid `var(--accent-dm)`
- **System Message**
  - Text: `var(--text-secondary)`
  - Border: `var(--border-strong)`
- **Note Card**
  - Border-left: 3px solid `var(--accent-primary)`
  - Click → opens Note Popout

### **Composer**

| Property   | Value                                        |
| ---------- | -------------------------------------------- |
| Height     | 48px                                         |
| Background | `var(--bg-surface)`                          |
| Border top | `var(--border-subtle)`                       |
| Input      | Slash commands, whisper target, autocomplete |

---

## **3.3 Right Rail — Icon Tabs**

| Property   | Value                   |
| ---------- | ----------------------- |
| Width      | **56px**                |
| Background | `var(--bg-surface-alt)` |
| Layout     | Vertical, centered      |
| Padding    | 8px 0                   |
| Icon Size  | 24px                    |
| Tooltip    | Appears on hover        |

### **Tab Order (top → bottom)**

1. Rooms
2. Journal
3. Notes
4. History
5. Search
6. Settings

---

# 4. **Right Panel (Slide‑In Panels)**

## **4.1 Panel Container**

| Property    | Value                  |
| ----------- | ---------------------- |
| Width       | **360px**              |
| Background  | `var(--bg-elevated)`   |
| Border-left | `var(--border-strong)` |
| Layout      | Vertical               |
| Padding     | 16px                   |
| Motion      | Slide‑in 180ms         |

---

## **4.2 Rooms Panel**

- Title: “Rooms”
- Create Room Button
- Room List
  - Room Name
  - Rename
  - Delete
  - Environment Selector

---

## **4.3 Player Management Panel**

- Player Name
- Gain Slider
- Mute Toggle
- Condition Dropdown
- Distance Dropdown

---

# 5. **Z‑Index Hierarchy**

| Layer        | z-index |
| ------------ | ------- |
| Toasts       | 1000    |
| Popouts      | 900     |
| Right Panel  | 800     |
| Right Rail   | 700     |
| DM Voice Bar | 600     |
| Toolbar      | 500     |
| Main Content | 100     |

---

# 6. **Auto‑Layout Rules**

### **Toolbar**

- Horizontal
- Space-between
- Center aligned

### **DM Voice Bar**

- Horizontal
- Left aligned
- Wrap disabled

### **Left Rail**

- Vertical
- Scrollable

### **Center Pane**

- Vertical
- Chat window grows
- Composer fixed bottom

### **Right Rail**

- Vertical
- Centered icons

### **Right Panel**

- Vertical
- Scrollable content

---

# 7. **Motion & Interaction Overlays**

### **Slide‑In Panel**

```
translateX(100%) → 0
duration: 180ms
easing: primary
```

### **Note Popout**

```
translateX(100%) → 0
duration: 180ms
```

### **Player Drag‑Drop**

- Pickup: scale 1.00 → 1.05
- Drop target glow: `var(--accent-primary-soft)`

### **Voice Preset Press**

- scale 1.00 → 0.96 → 1.00

---

# 8. **Component Naming (Figma‑Ready)**

- `Frame / DM Persona`
- `Component / Toolbar`
- `Component / DM Voice Bar`
- `Component / Left Rail`
- `Component / Player Item`
- `Component / Room Item`
- `Component / Center Pane`
- `Component / Chat Message`
- `Component / Note Card`
- `Component / Composer`
- `Component / Right Rail`
- `Component / Right Panel`
- `Component / Rooms Panel`
- `Component / Player Management Panel`

All components should be built with **Auto‑Layout** and **Variants**.
