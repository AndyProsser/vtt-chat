# **DM PERSONA — HIGH‑FIDELITY ASCII WIREFRAME**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  TOOLBAR (bg-surface-alt)                                                    │
│  [Campaign Name]     [Session 12 • 02:14:33]        [Conn: ●] [Theme] [Menu] │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ DM VOICE BAR (bg-elevated)                                                   │
│ [Preset: Deep] [Preset: Noble] [Preset: Whisper] [Preset: Monster] [Preset…] │
│ [Push-to-Talk ●] [Clear All]                                                 │
└──────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────┬───────────────────────────────────────────────┬───────────────┐
│ LEFT RAIL (Player List)    │ CENTER PANE — CHAT ONLY                       │ RIGHT RAIL    │
│ bg-surface                 │ bg-app                                        │ ICON TABS     │
│                            │                                               │ bg-surface-alt│
│  ROOMS                     │  ROOM HEADER                                  │               │
│  • Tavern (3)              │  Tavern  |  Environment: Tavern Interior      │  [Rooms]      │
│     - Alice (speaking)     │───────────────────────────────────────────────┤  [Journal]    │
│     - Bob (muted)          │                                               │  [Notes]      │
│     - Clara                │  CHAT WINDOW (scroll)                         │  [History]    │
│                            │   ┌─────────────────────────────────────────┐ │  [Search]     │
│  • Alley (2)               │   │ Alice: “Hello”                          │ │  [Settings]   │
│     - Dorian               │   ├─────────────────────────────────────────┤ │               │
│     - Eryn                 │   │ Bob: “…”                                │ │               │
│                            │   ├─────────────────────────────────────────┤ │               │
│  • Unassigned (1)          │   │ NOTE CARD: “Clue Found…” (click to open)│ │               │
│     - NPC: Guard           │   └─────────────────────────────────────────┘ │               │
│                            │                                               │               │
│  [Manage Players] (DM)     │  COMPOSER                                     │               │
│  (opens full player panel) │  [ /whisper … ]                               │               │
└────────────────────────────┴───────────────────────────────────────────────┴───────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ RIGHT PANEL (Slide‑In) — Example: ROOMS PANEL                                │
│ bg-elevated                                                                  │
│                                                                              │
│  ROOMS                                                                       │
│  [ + Create Room ]                                                           │
│                                                                              │
│  Tavern        [Rename] [Delete]                                             │
│  Environment: [Tavern Interior ▼]                                            │
│                                                                              │
│  Alley         [Rename] [Delete]                                             │
│  Environment: [Street ▼]                                                     │
│                                                                              │
│  Unassigned    [Rename] [Delete]                                             │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ RIGHT PANEL (Slide‑In) — Example: PLAYER MANAGEMENT PANEL (DM Only)          │
│ bg-elevated                                                                  │
│                                                                              │
│  PLAYERS                                                                     │
│                                                                              │
│  Alice (Tavern)                                                              │
│   Gain: [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■]                                   │
│   Mute: [Toggle]                                                             │
│   Condition: [None ▼]                                                        │
│   Distance: [Near ▼]                                                         │
│                                                                              │
│  Bob (Tavern)                                                                │
│   Gain: [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■]                                   │
│   Mute: [Toggle]                                                             │
│   Condition: [Poisoned ▼]                                                    │
│   Distance: [Far ▼]                                                          │
│                                                                              │
│  Clara (Tavern)                                                              │
│   Gain: […]                                                                  │
│   …                                                                          │
└──────────────────────────────────────────────────────────────────────────────┘

```

---

# **DM PERSONA — HIGH‑FIDELITY SPEC**

Below is the full implementation‑ready specification.

---

# 🎨 1. Layout Structure

### **1.1 Top‑Level Regions**

| Region       | Height      | Tokens             | Notes           |
| ------------ | ----------- | ------------------ | --------------- |
| Toolbar      | 48px        | `--bg-surface-alt` | Always visible  |
| DM Voice Bar | 56px        | `--bg-elevated`    | DM‑only         |
| Main Area    | flex        | —                  | 3‑column layout |
| Right Panel  | 360px width | `--bg-elevated`    | Slide‑in        |

### **1.2 Main Area Columns**

| Column          | Width                               | Notes            |
| --------------- | ----------------------------------- | ---------------- |
| Left Rail       | 240px (expanded) / 64px (collapsed) | Player list      |
| Center Pane     | flex‑1                              | Chat + Notes     |
| Right Rail Tabs | 56px                                | Vertical tab bar |

---

# 🎛️ 2. Token Mapping (DM Persona)

### **2.1 Backgrounds**

- Toolbar → `--bg-surface-alt`
- DM Voice Bar → `--bg-elevated`
- Left Rail → `--bg-surface`
- Center Pane → `--bg-app`
- Chat Window → `--bg-surface`
- Right Tabs → `--bg-surface-alt`
- Slide‑In Panels → `--bg-elevated`

### **2.2 Borders**

- Toolbar bottom → `--border-subtle`
- Right Panel left border → `--border-strong`
- Chat message separators → `--border-subtle`

### **2.3 Text**

- Primary → `--text-primary`
- Secondary → `--text-secondary`
- Muted → `--text-muted`

### **2.4 Persona Accents**

- DM accent → `--accent-dm`
- Player accent → `--accent-player`
- Spectator accent → `--accent-spectator`

### **2.5 Functional Accents**

- Speaking → `--accent-primary`
- Mute → `--accent-error`
- Conditions → `--accent-warning`

---

# 🎙️ 3. DM‑Specific Components

## **3.1 DM Voice Bar**

| Element    | Spec                                               |
| ---------- | -------------------------------------------------- |
| Height     | 56px                                               |
| Background | `--bg-elevated`                                    |
| Controls   | Preset, Environment, Condition, Distance, Override |
| Buttons    | 32px height, accent on hover                       |
| Clear All  | Uses `--accent-error` glow                         |

### Motion

- Slide‑down on appear: 140ms, primary easing
- Button press: scale 0.96 → 1.0

---

## **3.2 Player Overrides (Hover in Left Rail)**

| Element            | Spec                   |
| ------------------ | ---------------------- |
| Gain slider        | 0–200%, accent-primary |
| Mute toggle        | accent-error           |
| Condition dropdown | accent-warning         |
| Distance selector  | accent-primary         |

### Motion

- Fade‑in on hover: 120ms
- Slight scale on controls: 1.0 → 1.02

---

## **3.3 Rooms Panel (Right Slide‑In)**

| Element       | Spec            |
| ------------- | --------------- |
| Width         | 360px           |
| Background    | `--bg-elevated` |
| Room item     | 48px height     |
| Create button | accent-primary  |
| Delete button | accent-error    |

### Motion

- Slide‑in: 180ms
- Chat shifts left: 180ms

---

# 💬 4. Center Pane (Chat + Notes)

## **4.1 Room Header**

- Height: 48px
- Text: `--text-primary`
- Whisper target badge: `--accent-primary`

## **4.2 Chat/Notes Toggle**

- Active tab underline: `--accent-primary`
- Inactive text: `--text-secondary`

## **4.3 Chat Window**

- Background: `--bg-surface`
- Message bubble spacing: 8px vertical
- Own message border: `--accent-player`
- System message border: `--border-strong`

## **4.4 Composer**

- Height: 48px
- Background: `--bg-surface`
- Border: `--border-subtle`
- Slash commands: autocomplete dropdown

---

# 👥 5. Left Rail (Player List)

## **5.1 Rooms**

- Section header: `--text-muted`
- Room name: `--text-secondary`

## **5.2 Player Item**

- Height: 40px
- Avatar: 32px
- Speaking ring: `--accent-primary`
- Mute icon: `--accent-error`
- Hover: `--accent-primary-soft`

---

# 🧭 6. Right Rail Tabs

| Tab      | Icon | Visibility |
| -------- | ---- | ---------- |
| Search   | 🔍   | DM only    |
| Notes    | 📝   | DM only    |
| Journal  | 📘   | DM only    |
| History  | 🕒   | DM only    |
| Settings | ⚙️   | DM only    |

### Motion

- Tab select: scale 0.96 → 1.0
- Active border: `--accent-primary`

---

# 🧠 7. Motion Overlays (DM Persona)

### **7.1 Slide‑In Panels**

- 180ms
- `translateX(100%) → 0`
- Chat shifts left by panel width

### **7.2 Player Drag‑Drop**

- Pickup: scale 1.0 → 1.05
- Drop target glow: `--accent-primary`

### **7.3 Note Pop‑Out**

- Slide‑in from right
- 180ms

### **7.4 DM Voice Bar**

- Slide‑down
- 140ms

---

# ✔ 8. Summary

This DM Persona mockup includes:

- Full ASCII wireframe
- Full high‑fidelity spec
- Token mappings
- Motion rules
- Persona‑specific behaviours
- Implementation‑ready structure

This is the **master persona** — Player and Spectator will be derived from this.
