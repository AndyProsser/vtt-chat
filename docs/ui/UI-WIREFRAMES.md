# **UI‑WIREFRAMES.md**

_Wireframes for DM, Player, and Spectator personas._

---

## **1. DM UI Wireframe**

The DM interface is the most complex: multi‑panel, high‑density, and control‑heavy.
This wireframe reflects the full control surface.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme] [Settings] [Information] [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Curse of Strahd | DM: Andy | Session 12 | 02:14:33 | [Session Cog]                   │
│ TOASTS: [Connection Restored] [×]                                                              │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│ DM VOICE BAR: Presets | Env | Conditions | Distance | Overrides | PTT | Clear                  │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Players)      │                                                             │ (Popout Surface)│
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall ▼                                     │ │ Information:    │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Audio           │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Campaign        │
│  • Mira 🔇     │  ├────────────────────────────────────────────────────────┤ │ Search          │
│────────────────│  │ CHAT WINDOW                                            │ │ Notes           │
│ [Group 1]      │  │  • System: Thorin joined                               │ │ Journal (flag)  │
│  • Player A    │  │  • Lyra: “I check the door.”                           │ │ History         │
│────────────────│  ├────────────────────────────────────────────────────────┤ │                 │
│ [Private: M+T] │  │ MESSAGE COMPOSER                                       │ │                 │
│────────────────│  │  > Type message… [Whisper ▼] [Publish Note]            │ │ Settings:       │
│ [+ Create]     │  └────────────────────────────────────────────────────────┘ │                 │
│                │                                                             │ System/Campaign │
│                │                                                             │ /Profile        │
└────────────────┴─────────────────────────────────────────────────────────────┴─────────────────┘

Session Settings Popover (from Session Cog):

┌─────────────────────────────────────────────┐
│ SESSION SETTINGS                            │
│ Name: [Session 12]                          │
│ Description (markdown): [In today's ...]    │
│ Timer override: [480 min] (warn > default)  │
│ [Save] [Cancel]                             │
└─────────────────────────────────────────────┘

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
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme] [Settings] [Information] [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Curse of Strahd | Session 12 | 02:14:33 | [Session Cog]                              │
│ TOASTS: [You joined Main Hall] [×]                                                             │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Players)      │                                                             │ (Popout Surface)│
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall                                       │ │ Information:    │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Campaign (RO)   │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Search          │
│  • Mira 🔇     │  ├────────────────────────────────────────────────────────┤ │ Notes (RO)      │
│────────────────│  │ CHAT WINDOW                                            │ │ History (RO)    │
│ [Group 1]      │  │  • Thorin: “I open the chest.”                         │ │                 │
│────────────────│  ├────────────────────────────────────────────────────────┤ │                 │
│                │  │ MESSAGE COMPOSER                                       │ │                 │
│                │  │  > Type message… [Whisper ▼] [Attach] [IC]             │ │ Settings (RO):  │
│                │  │                                                        │ │ Campaign/Profile│
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
│ TOOLBAR: [Logo & Title] [Audio Devices] [Theme] [Settings] [Information] [Connection Status ●] │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ CAMPAIGN: Spectator Mode | Session 12 | 02:14:33 | [Session Cog]                               │
│ LIFECYCLE: [Session Started] marker appears in chat stream                                     │
└────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────────────────────────────────┬─────────────────┐
│ LEFT PANEL     │ CENTER PANEL                                                │ RIGHT PANEL     │
│ (Read‑Only)    │                                                             │ (Popout Surface)│
│────────────────│  ┌────────────────────────────────────────────────────────┐ │─────────────────│
│ [Main Group]   │  │ GROUP: Main Hall                                       │ │ Information:    │
│  • Thorin 🔊   │  ├────────────────────────────────────────────────────────┤ │ Campaign (RO)   │
│  • Lyra        │  │ [Chat ▼] [Notes]                                       │ │ Search (RO)     │
│  • Mira        │  ├────────────────────────────────────────────────────────┤ │ Notes (RO)      │
│────────────────│  │ READ‑ONLY CHAT WINDOW                                  │ │ History (RO)    │
│ [Group 1]      │  │  • Mira: “I scout ahead.”                              │ │                 │
│────────────────│  └────────────────────────────────────────────────────────┘ │                 │
│                │                                                             │ Settings (RO):  │
│                │                                                             │ Campaign/Profile│
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
│ Group + Roster │ Chat + Composer                                      │ Information/Settings     │
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
