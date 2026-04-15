Absolutely, Andy — here is a **refined, updated set of wireframes** incorporating your new requirements:

- **Player list for ALL personas** (DM, Player, Spectator)
- **Avatar‑first design** with overlays for speaking/mute/conditions
- **Collapsible panel** that shrinks to avatar‑only mode
- **Notes panel hidden behind a toggle button** (chat ↔ notes)
- **Optional “screenshare space” note viewer**
- **DM Audio Controls moved to a horizontal bar under the top bar**
- **DM can toggle each audio section on/off**

All wireframes are Markdown‑friendly and ready for your repo.

---

# **UI‑WIREFRAMES.md (Updated)**

_Wireframes for DM, Player, and Spectator personas with new layout rules._

---

# 🎭 **1. DM UI Wireframe (Updated)**

DM gets the full control surface, but now with:

- **Left player list** (collapsible)
- **Horizontal audio bar** under top bar
- **Chat/Notes toggle button**
- **Optional large note viewer**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Session Controls | Room Selector | Recording | Recap | DM Status    │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ AUDIO CONTROL BAR (Horizontal, Collapsible, DM‑toggleable sections)          │
│ [Voice Presets] [Environment] [Conditions] [Distance] [IC Mode] [Overrides]  │
│ [PTT] [Clear All]                                                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐  ┌──────────────────────────────────────────────────────────┐  ┌────────────────┐
│ PLAYER LIST    │  │                        CHAT / NOTES PANEL                │  │ OPTIONAL NOTE  │
│ (Collapsible)  │  │----------------------------------------------------------│  │ VIEWER (Large) │
│----------------│  │ [Chat ▼] [Notes]  (Toggle buttons)                       │  │ (DM can pop    │
│ [Avatar] Name  │  │----------------------------------------------------------│  │ notes here)    │
│ Class/Race/Lvl │  │ [Chat Messages OR Notes List]                            │  │----------------│
│ [Speaking 🔊]  │  │   • System: Thorin joined room                           │  │ [Note Content] │
│ [Mute 🔇]      │  │   • Lyra: “I check the door.”                            │  │ Scrollable     │
│ [Conditions ⚠] │  │----------------------------------------------------------│  │----------------│
│----------------│  │ [Message Composer]                                       │  │ [Close]        │
│ Room Manager   │  │  > Type message… [Whisper ▼] [Publish Note]              │  └────────────────┘
│ [Main]         │  └──────────────────────────────────────────────────────────┘
│ [Group 1]      │
│ [Group 2]      │
│ [Private: M+T] │
│ [+ Create]     │
└────────────────┘
```

---

# 🎮 **2. Player UI Wireframe (Updated)**

Players now have:

- **Left player list** (same avatar system as DM)
- **Chat/Notes toggle**
- **Optional large note viewer**
- **Minimal audio controls (self‑mute + IC)**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Room Name | Self Mute | IC Toggle | Theme | Connection Indicator                        │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐  ┌──────────────────────────────────────────────────────────┐  ┌────────────────┐
│ PLAYER LIST    │  │                        CHAT / NOTES PANEL                │  │ OPTIONAL NOTE  │
│ (Collapsible)  │  │----------------------------------------------------------│  │ VIEWER (Large) │
│----------------│  │ [Chat ▼] [Notes]                                         │  │ (Player can    │
│ [Avatar] Name  │  │----------------------------------------------------------│  │ pop notes here)│
│ Class/Race/Lvl │  │ [Chat Messages OR Notes List]                            │  │----------------│
│ [Speaking 🔊]  │  │   • System: You joined Main Room                         │  │ [Note Content] │
│ [Mute 🔇]      │  │   • Thorin: “I open the chest.”                          │  │ Scrollable     │
│ [Conditions ⚠] │  │----------------------------------------------------------│  │----------------│
│----------------│  │ [Message Composer]                                       │  │ [Close]        │
│ (No DM tools)  │  │  > Type message… [Whisper ▼] [Attach] [IC]               │  └────────────────┘
└────────────────┘  └──────────────────────────────────────────────────────────┘
```

---

# 👁️ **3. Spectator UI Wireframe (Updated)**

Spectators now also get:

- **Left player list** (read‑only)
- **Chat/Notes toggle**
- **Read‑only note viewer**

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: Spectator Mode | Theme | Connection Indicator                                           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────┐  ┌──────────────────────────────────────────────────────────┐  ┌────────────────┐
│ PLAYER LIST    │  │                        CHAT / NOTES PANEL                │  │ OPTIONAL NOTE  │
│ (Collapsible)  │  │----------------------------------------------------------│  │ VIEWER (Large) │
│----------------│  │ [Chat ▼] [Notes]                                         │  │ (Read‑Only)    │
│ [Avatar] Name  │  │----------------------------------------------------------│  │----------------│
│ Class/Race/Lvl │  │ [Read‑Only Chat OR Global Notes]                         │  │ [Note Content] │
│ [Speaking 🔊]  │  │   • Mira: “I scout ahead.”                               │  │ Scrollable     │
│ [Mute 🔇]      │  │----------------------------------------------------------│  │----------------│
│ [Conditions ⚠] │  │ [No Composer]                                            │  │ [Close]        │
└────────────────┘  └──────────────────────────────────────────────────────────┘  └────────────────┘
```

---

# 🧩 **Component Rules**

## ✔ Player List (All Personas)

- Left side
- Collapsible to avatar‑only strip
- Avatar min size: **32px**
- Overlays:
  - 🔊 speaking
  - 🔇 muted
  - ⚠ conditions
- Under name: **class / race / level**
- DM appears in list for players & spectators

## ✔ Notes Panel

- Hidden behind a **Chat / Notes toggle button**
- Notes replace chat when opened
- Optional “pop‑out” note viewer on right side
- Unread count badge on Notes button

## ✔ DM Audio Controls

- Horizontal bar under top bar
- Collapsible
- DM can toggle each section on/off:
  - Voice presets
  - Environment
  - Conditions
  - Distance
  - IC mode
  - Overrides
  - PTT
  - Clear All

---
