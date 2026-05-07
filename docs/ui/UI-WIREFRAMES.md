# **UI‑WIREFRAMES.md**

_Wireframes for DM, Player, and Spectator personas._

---

## **1. DM UI Wireframe**

The DM interface is the most complex: multi‑panel, high‑density, and control‑heavy.
This wireframe reflects the full control surface.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme]                          [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Curse of Strahd | DM: Andy | Session 12 | 02:14:33                                   │
│ TOASTS: [Connection Restored] [×]                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DM VOICE BAR: Presets | Env | Conditions | Distance | Overrides | PTT | Clear                  │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Players)      │                                                             │ (Vertical Tabs) │
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall ▼                                     │ │ Groups          │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Audio           │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Search          │
│  • Mira 🔇     │  ├────────────────────────────────────────────────────────┤ │ Notes           │
│────────────────│  │ CHAT WINDOW                                            │ │ Journal         │
│ [Group 1]      │  │  • System: Thorin joined                               │ │ History         │
│  • Player A    │  │  • Lyra: “I check the door.”                           │ │ Settings        │
│────────────────│  ├────────────────────────────────────────────────────────┤ │                 │
│ [Private: M+T] │  │ MESSAGE COMPOSER                                       │ │                 │
│────────────────│  │  > Type message… [Whisper ▼] [Publish Note]            │ │                 │
│ [+ Create]     │  └────────────────────────────────────────────────────────┘ │                 │
└────────────────┴─────────────────────────────────────────────────────────────┴─────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTE POP‑OUT (Optional)                                                      │
│──────────────────────────────────────────────────────────────────────────────│
│ [Note Title]                                                                 │
│ [Note Content — scrollable]                                                  │
│ [Close]                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

```

---

## **2. Player UI Wireframe**

Players get a **clean, focused, immersive** interface.
No DM tools, no group management, no global audio controls.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme]                          [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Curse of Strahd | Session 12 | 02:14:33                                              │
│ TOASTS: [You joined Main Hall] [×]                                                             │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Players)      │                                                             │ (Vertical Tabs) │
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall                                       │ │ Notes           │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Journal (RO)    │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Search          │
│  • Mira 🔇     │  ├────────────────────────────────────────────────────────┤ │ History (RO)    │
│────────────────│  │ CHAT WINDOW                                            │ │ Settings        │
│ [Group 1]      │  │  • Thorin: “I open the chest.”                         │ │                 │
│────────────────│  ├────────────────────────────────────────────────────────┤ │                 │
│                │  │ MESSAGE COMPOSER                                       │ │                 │
│                │  │  > Type message… [Whisper ▼] [Attach] [IC]             │ │                 │
│                │  └────────────────────────────────────────────────────────┘ │                 │
└────────────────┴─────────────────────────────────────────────────────────────┴─────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTE POP‑OUT (Optional)                                                      │
│──────────────────────────────────────────────────────────────────────────────│
│ [Note Title]                                                                 │
│ [Note Content — scrollable]                                                  │
│ [Close]                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘

```

---

## **3. Spectator UI Wireframe**

Spectators see **only what is allowed**:
Read‑only chat, read‑only notes, no composer, no audio controls.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme]                          [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Spectator Mode | Session 12 | 02:14:33                                               │
│ TOASTS: [Session Started] [×]                                                                  │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Read‑Only)    │                                                             │ (Vertical Tabs) │
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall                                       │ │ Notes (RO)      │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Journal (RO)    │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Search (RO)     │
│  • Mira        │  ├────────────────────────────────────────────────────────┤ │ History (RO)    │
│────────────────│  │ READ‑ONLY CHAT WINDOW                                  │ │ Settings        │
│ [Group 1]      │  │  • Mira: “I scout ahead.”                              │ │                 │
│────────────────│  └────────────────────────────────────────────────────────┘ │                 │
└────────────────┴─────────────────────────────────────────────────────────────┴─────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTE POP‑OUT (Optional, Read‑Only)                                           │
│──────────────────────────────────────────────────────────────────────────────│
│ [Note Title]                                                                 │
│ [Note Content — scrollable]                                                  │
│ [Close]                                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Notes on Implementation

### **DM UI**

- Multi‑panel layout
- Requires drag‑and‑drop
- Requires collapsible panels
- Requires high‑density information

### **DM Desktop Command Variant (`>=1280px`)**

```text
┌────────────────┬──────────────────────────────────────────────────────┬──────────────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                         │ PINNED RIGHT PANEL       │
│ (unchanged)    │ (chat/notes, flexible width)                         │ (always open, one tab)   │
│────────────────│───────────────────────────────────────────────────────│──────────────────────────│
│ Group + Roster │ Chat + Composer                                      │ Notes / Search / History │
│ Voice controls │                                                       │ (click right icon swaps) │
└────────────────┴──────────────────────────────────────────────────────┴──────────────────────────┘
```

- Right-edge icon rail remains visible.
- Exactly one panel stays open at all times.
- Default pinned panel is last used.

### **Player UI**

- Chat‑first
- Minimal controls
- IC toggle is prominent
- Notes are secondary

### **Balanced Player Variant (`768px-1279px`, target `~900px`)**

- Existing popout right-panel behavior remains primary.
- Left panel and chat remain prioritized.

### **Spectator UI**

- Chat‑only
- No composer
- No audio controls
- No whispers
- No private groups

### **Minimalist Mobile Variant (`<=767px`)**

```text
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BAR: campaign + compact status + expand-left-panel icon         │
├──────────────────────────────────────────────────────────────────────┤
│ LEFT COMPACT COLUMN: group icons + avatars + mute/unmute + meter    │
├──────────────────────────────────────────────────────────────────────┤
│ CENTER: chat-first surface                                           │
├──────────────────────────────────────────────────────────────────────┤
│ BOTTOM DOCK: right-panel icons (open bottom popover panel)          │
└──────────────────────────────────────────────────────────────────────┘
```

- Left panel expands to full-width overlay when requested.
- DM receives a one-time dismissible warning banner in this mode.
