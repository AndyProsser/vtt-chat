# **UI‑WIREFRAMES.md**

_Wireframes for DM, Player, and Spectator personas._

---

# 🎭 **1. DM UI Wireframe**

The DM interface is the most complex: multi‑panel, high‑density, and control‑heavy.
This wireframe reflects the full control surface.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Session Controls | Room Selector | Recording | Recap | DM Status    │
└──────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐  ┌──────────────────────────────────────────────────────────┐  ┌───────────────┐
│ PLAYER LIST    │  │                        CHAT PANEL                        │  │  AUDIO CTRL   │
│ (All Players)  │  │----------------------------------------------------------│  │---------------│
│----------------│  │ [Room Tabs] [Whispers] [External Logs Toggle]            │  │ Voice Presets │
│ Thorin (Main)  │  │----------------------------------------------------------│  │ Env Presets   │
│ Lyra (Group 1) │  │ [Chat Messages Scroll Area]                              │  │ Conditions    │
│ Mira (Private) │  │   • System: Thorin joined room                           │  │ Distance      │
│ ...            │  │   • Lyra: “I check the door.”                            │  │ IC Mode       │
│----------------│  │   • DM published note: “Map Fragment A”                  │  │ Overrides     │
│ Room Manager   │  │----------------------------------------------------------│  │ PTT Override  │
│ [Main]         │  │ [Message Composer]                                       │  │ Clear All     │
│ [Group 1]      │  │  > Type message… [Whisper ▼] [Publish Note]              │  └───────────────┘
│ [Group 2]      │  └──────────────────────────────────────────────────────────┘
│ [Private: M+T] │
│ [+ Create]     │
└────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTES & METADATA PANEL (Collapsible)                                         │
│------------------------------------------------------------------------------│
│ [Notes List] [Metadata Cards] [Create Note] [Create Card]                    │
│ - Map: Ruined Temple (Shared: Party)                                         │
│ - NPC: Arkon the Binder (DM Only)                                            │
│ - Session Summary (Recap‑worthy)                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 🎮 **2. Player UI Wireframe**

Players get a **clean, focused, immersive** interface.
No DM tools, no room management, no global audio controls.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Room Name | Self Mute | IC Toggle | Theme | Connection Indicator    │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                                CHAT PANEL                                    │
│------------------------------------------------------------------------------│
│ [Chat Messages Scroll Area]                                                  │
│   • System: You joined Main Room                                             │
│   • Thorin: “I open the chest.”                                              │
│   • Lyra: “Careful…”                                                         │
│------------------------------------------------------------------------------│
│ [Message Composer]                                                           │
│   > Type message… [Whisper ▼] [Attach Image] [IC Toggle]                     │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTES PANEL (Collapsible)                                                    │
│------------------------------------------------------------------------------│
│ - My Notes                                                                   │
│ - Shared Notes (Party)                                                       │
│ - Shared With Me (Individual)                                                │
│------------------------------------------------------------------------------│
│ [View Note] [Create Note]                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 👁️ **3. Spectator UI Wireframe**

Spectators see **only what is allowed**:
Read‑only chat, read‑only notes, no composer, no audio controls.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Spectator Mode | Theme | Connection Indicator                       │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┬───────────────────┐
│                        CHAT PANEL                        │  PLAYER LIST      │
│----------------------------------------------------------│-------------------│
│ [Read‑Only Chat Scroll Area]                             │ Thorin (Speaking) │
│   • System: Session started                              │ Lyra              │
│   • Mira: “I scout ahead.”                               │ Mira              │
│----------------------------------------------------------│-------------------│
│ [No Composer]                                            │ (Read‑Only)       │
└──────────────────────────────────────────────────────────┴───────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ NOTES PANEL (Read‑Only, GLOBAL Notes Only)                                   │
│------------------------------------------------------------------------------│
│ - World Map                                                                  │
│ - Campaign Primer                                                            │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

# 🧠 Notes on Implementation

### **DM UI**

- Multi‑panel layout
- Requires drag‑and‑drop
- Requires collapsible panels
- Requires high‑density information

### **Player UI**

- Chat‑first
- Minimal controls
- IC toggle is prominent
- Notes are secondary

### **Spectator UI**

- Chat‑only
- No composer
- No audio controls
- No whispers
- No private rooms
