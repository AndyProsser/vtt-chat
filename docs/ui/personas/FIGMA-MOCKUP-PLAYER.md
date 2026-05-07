# **PLAYER PERSONA — FIGMA‑READY MOCKUP (FULL SPEC)**

_Aligned with your architecture, token system, and persona rules._

Viewport mode set for Player mockups:

- **Minimalist Mobile**: `<=767px`
- **Balanced Player**: `768px-1279px` (target `~900px`, primary player baseline)
- **DM Desktop Command**: `>=1280px` (player opt-in only)

Desktop Command note for players:

- Players can opt in to keep one right utility panel pinned open on wide screens.

---

## 1. **Frame Specification**

### **1.1 Root Frame**

| Property   | Value                   |
| ---------- | ----------------------- |
| Name       | `Player Persona — Main` |
| Width      | 1920px                  |
| Height     | 1080px                  |
| Layout     | Vertical stack          |
| Padding    | 0                       |
| Spacing    | 0                       |
| Background | `var(--bg-app)`         |

### **1.2 Mode Variant Frames**

Create three linked variant frames in Figma:

1. `Player Persona — Minimalist Mobile`
2. `Player Persona — Balanced Player`
3. `Player Persona — Desktop Command (Opt-in)`

Variant behavior:

- Minimalist Mobile: chat-first, compact left controls, bottom tool dock with popover panels.
- Balanced Player: existing baseline layout and popout right-panel interactions.
- Desktop Command Opt-in: one pinned right panel stays open and switches via icon rail.

---

## 2. **Top Regions**

### **2.1 Toolbar**

Identical structure to DM, but **no DM‑only controls**.

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
- **Right:** Connection Indicator, Theme Toggle, Menu

_No DM Voice Bar._

---

## 3. **Main Layout (3 Columns)**

The Player Persona keeps the same structural grid as DM, but with **restricted functionality**.

Mode adaptation:

- Balanced Player is the default behavior.
- Minimalist Mobile compresses layout around chat with bottom tool docking.
- Desktop Command opt-in adds persistent right-panel workspace while preserving player permissions.

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

- Players see **only groups they are allowed to see**
- No DM‑only overrides
- No right‑click environment menu

#### **Player Item**

| Element       | Spec                         |
| ------------- | ---------------------------- |
| Height        | 40px                         |
| Avatar        | 32px                         |
| Speaking Ring | `var(--accent-primary)`      |
| Mute Icon     | `var(--accent-error)`        |
| Hover         | `var(--accent-primary-soft)` |
| Right‑click   | Whisper only (if enabled)    |

#### **Player‑Only Controls**

- **Whisper to Player** (right‑click)
- **No Manage Players button**
- **No Conditions**
- **No Distance**
- **No Gain sliders**

---

### **3.2 Center Pane — Chat Only**

Players have the same chat experience as DM, minus DM‑only message types.

| Property   | Value           |
| ---------- | --------------- |
| Width      | flex‑1          |
| Background | `var(--bg-app)` |
| Layout     | Vertical        |

#### **Group Header**

| Property   | Value                                |
| ---------- | ------------------------------------ |
| Height     | 48px                                 |
| Background | `var(--bg-surface)`                  |
| Padding    | 0 16px                               |
| Content    | Group Name + Environment (read‑only) |

Players **see** the environment but cannot change it.

---

#### **Chat Window**

| Property        | Value               |
| --------------- | ------------------- |
| Background      | `var(--bg-surface)` |
| Scroll          | Yes                 |
| Padding         | 16px                |
| Message Spacing | 12px                |

##### **Message Types (Player Persona)**

| Type                 | Visible? | Notes                              |
| -------------------- | -------- | ---------------------------------- |
| Player Message       | ✔        | Own messages use `--accent-player` |
| Other Player Message | ✔        | Standard border                    |
| DM Message           | ✔        | Border-left `--accent-dm`          |
| System Message       | ✔        | Secondary text                     |
| Note Card            | ✔        | Click to open                      |

Players cannot create global notes, but they can **view** any note visible to them.

---

#### **Composer**

| Property   | Value                                        |
| ---------- | -------------------------------------------- |
| Height     | 48px                                         |
| Background | `var(--bg-surface)`                          |
| Border top | `var(--border-subtle)`                       |
| Input      | Slash commands, whisper target, autocomplete |

Players can:

- Send messages
- Whisper
- Use slash commands
- Insert note cards (if allowed by DM settings)

Players cannot:

- Send DM‑only commands
- Create DM‑only notes

---

### **3.3 Right Rail — Icon Tabs**

Players see **fewer tabs**.

| Property   | Value                   |
| ---------- | ----------------------- |
| Width      | 56px                    |
| Background | `var(--bg-surface-alt)` |
| Layout     | Vertical                |
| Padding    | 8px 0                   |
| Icon Size  | 24px                    |

#### **Player Tab Order (top → bottom)**

1. Notes
2. Journal
3. History
4. Search
5. Settings

Players do **not** see:

- Groups tab
- DM‑only tools

---

## 4. **Right Panel (Slide‑In Panels)**

### **4.1 Panel Container**

| Property    | Value                  |
| ----------- | ---------------------- |
| Width       | 360px                  |
| Background  | `var(--bg-elevated)`   |
| Border-left | `var(--border-strong)` |
| Layout      | Vertical               |
| Padding     | 16px                   |
| Motion      | Slide‑in 180ms         |

---

### **4.2 Notes Panel (Player Version)**

Players see:

- Notes shared with them
- Their own notes
- Global notes

Players cannot:

- Change visibility
- Create DM‑only notes

---

### **4.3 Journal Panel**

Read‑only unless DM grants write access.

---

### **4.4 History Panel**

Players see:

- Public events
- Their own events

Players do not see:

- DM‑only events
- Hidden rolls
- Private whispers between other players

---

### **4.5 Search Panel**

Players can search:

- Notes they can see
- Chat messages they can see
- Journal entries they can see

---

### **4.6 Settings Panel**

Player‑only settings:

- Theme
- Audio input/output
- Push‑to‑talk (player version)
- Chat preferences
- Accessibility

---

## 5. **Z‑Index Hierarchy**

Same as DM, minus DM‑only layers.

| Layer        | z-index |
| ------------ | ------- |
| Toasts       | 1000    |
| Popouts      | 900     |
| Right Panel  | 800     |
| Right Rail   | 700     |
| Toolbar      | 500     |
| Main Content | 100     |

---

## 6. **Auto‑Layout Rules**

### **Toolbar**

- Horizontal
- Space-between

### **Left Rail**

- Vertical
- Scrollable

### **Center Pane**

- Vertical
- Chat grows
- Composer fixed bottom

### **Right Rail**

- Vertical
- Centered icons

### **Right Panel**

- Vertical
- Scrollable

---

## 7. **Motion & Interaction Overlays**

### **Slide‑In Panel**

```text
translateX(100%) → 0
duration: 180ms
easing: primary
```

### **Note Popout**

```text
translateX(100%) → 0
duration: 180ms
```

### **Whisper Target**

- Highlight: `var(--accent-primary-soft)`
- Whisper badge in composer

### **Message Send**

- Fade-in 120ms
- Slight upward shift

---

## 8. **Component Naming (Figma‑Ready)**

- `Frame / Player Persona`
- `Component / Toolbar`
- `Component / Left Rail`
- `Component / Player Item`
- `Component / Group Item`
- `Component / Center Pane`
- `Component / Chat Message`
- `Component / Note Card`
- `Component / Composer`
- `Component / Right Rail`
- `Component / Right Panel`
- `Component / Notes Panel`
- `Component / Journal Panel`
- `Component / History Panel`
- `Component / Search Panel`
- `Component / Settings Panel`

---

## **Player Persona Figma‑Ready Mockup Complete**

This is the full, implementation‑grade specification for the Player Persona.

It is fully aligned with:

- DM Persona master spec
- Persona visibility rules
- Token system
- Motion system
- UI architecture
