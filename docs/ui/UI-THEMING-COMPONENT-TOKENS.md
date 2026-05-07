# **UI-THEMING-COMPONENT-TOKENS.md**

_Component‑specific token usage for VTT‑Chat._

---

## 1. Overview

This document defines **exactly which CSS tokens each UI component uses**, and for what purpose.

It ensures:

- No component invents its own colors
- No component uses raw hex values
- All styling is token‑driven
- Persona accents are applied consistently
- Light/dark mode works automatically

This is the authoritative reference for implementing the theme layer.

---

## 2. Token Categories

From `UI-THEMING.md`, components may use:

### **Background tokens**

- `--bg-app`
- `--bg-surface`
- `--bg-surface-alt`
- `--bg-elevated`

### **Border tokens**

- `--border-subtle`
- `--border-strong`

### **Text tokens**

- `--text-primary`
- `--text-secondary`
- `--text-muted`
- `--text-inverse`

### **Accent tokens**

- `--accent-primary`
- `--accent-primary-soft`
- `--accent-warning`
- `--accent-error`
- `--accent-success`

### **Persona tokens**

- `--accent-dm`
- `--accent-player`
- `--accent-spectator`

---

## 3. Component Token Map

Below is the **complete component → token mapping**.

---

### **3.1 Toolbar**

| Element                       | Tokens             |
| ----------------------------- | ------------------ |
| Background                    | `--bg-surface-alt` |
| Border bottom                 | `--border-subtle`  |
| Text                          | `--text-primary`   |
| Connection dot (connected)    | `--accent-success` |
| Connection dot (connecting)   | `--accent-warning` |
| Connection dot (disconnected) | `--accent-error`   |

---

### **3.2 CampaignInfo**

| Element          | Tokens             |
| ---------------- | ------------------ |
| Background       | `--bg-surface`     |
| Text (primary)   | `--text-primary`   |
| Text (secondary) | `--text-secondary` |
| Divider          | `--border-subtle`  |

---

### **3.3 SystemToasts**

| Element        | Tokens             |
| -------------- | ------------------ |
| Background     | `--bg-elevated`    |
| Border         | `--border-strong`  |
| Text           | `--text-primary`   |
| Level: info    | `--accent-primary` |
| Level: warning | `--accent-warning` |
| Level: error   | `--accent-error`   |

---

### **3.4 LeftRail (Player List)**

| Element                 | Tokens                                     |
| ----------------------- | ------------------------------------------ |
| Background              | `--bg-surface`                             |
| Section header          | `--text-muted`                             |
| Player hover            | `--accent-primary-soft`                    |
| Player name             | `--text-primary`                           |
| Speaking ring           | `--accent-primary`                         |
| Mute icon               | `--accent-error`                           |
| Condition icons         | `--accent-warning` (or condition‑specific) |
| DM override affordances | `--accent-dm`                              |

---

### **3.5 PlayerItem**

| Element              | Tokens                  |
| -------------------- | ----------------------- |
| Name                 | `--text-primary`        |
| Subtext              | `--text-secondary`      |
| Hover                | `--accent-primary-soft` |
| Drag highlight       | `--accent-primary`      |
| Persona badge (self) | `--accent-player`       |

---

### **3.6 CenterPane**

| Element    | Tokens            |
| ---------- | ----------------- |
| Background | `--bg-app`        |
| Surface    | `--bg-surface`    |
| Divider    | `--border-subtle` |

---

### **3.7 RoomHeader**

| Element             | Tokens             |
| ------------------- | ------------------ |
| Text                | `--text-primary`   |
| Whisper badge       | `--accent-primary` |
| Whisper target text | `--text-secondary` |

---

### **3.8 ChatNotesToggle**

| Element              | Tokens             |
| -------------------- | ------------------ |
| Active tab underline | `--accent-primary` |
| Inactive text        | `--text-secondary` |
| Active text          | `--text-primary`   |

---

### **3.9 ChatWindow**

| Element               | Tokens                  |
| --------------------- | ----------------------- |
| Background            | `--bg-surface`          |
| System message text   | `--text-secondary`      |
| System message border | `--border-strong`       |
| Scrollbar thumb       | `--accent-primary-soft` |

---

### **3.10 MessageBubble**

| Message Type           | Tokens                  |
| ---------------------- | ----------------------- |
| Own message border     | `--accent-player`       |
| Own message background | `--accent-primary-soft` |
| Other message border   | `--border-subtle`       |
| Other message text     | `--text-primary`        |
| Timestamp              | `--text-muted`          |

---

### **3.11 NoteCard (Chat)**

| Element                  | Tokens             |
| ------------------------ | ------------------ |
| Border-left              | `--accent-primary` |
| Title                    | `--text-primary`   |
| Snippet                  | `--text-secondary` |
| Visibility badge: DM     | `--accent-dm`      |
| Visibility badge: Party  | `--accent-player`  |
| Visibility badge: Global | `--accent-primary` |

---

### **3.12 NotesPanel**

| Element         | Tokens                  |
| --------------- | ----------------------- |
| Background      | `--bg-elevated`         |
| Note item hover | `--accent-primary-soft` |
| Note title      | `--text-primary`        |
| Note metadata   | `--text-muted`          |

---

### **3.13 NotePopout**

| Element      | Tokens             |
| ------------ | ------------------ |
| Background   | `--bg-elevated`    |
| Title        | `--text-primary`   |
| Content text | `--text-secondary` |
| Divider      | `--border-subtle`  |
| Close button | `--accent-primary` |

---

### **3.14 RightTabBar**

| Element           | Tokens             |
| ----------------- | ------------------ |
| Background        | `--bg-surface-alt` |
| Tab icon          | `--text-secondary` |
| Active tab border | `--accent-primary` |
| Active tab icon   | `--text-primary`   |

---

### **3.15 SlideInPanels**

| Element     | Tokens             |
| ----------- | ------------------ |
| Background  | `--bg-elevated`    |
| Border-left | `--border-strong`  |
| Header text | `--text-primary`   |
| Body text   | `--text-secondary` |

---

### **3.16 RoomsPanel (DM)**

| Element          | Tokens             |
| ---------------- | ------------------ |
| Group name       | `--text-primary`   |
| Environment icon | `--accent-primary` |
| Create button    | `--accent-primary` |
| Delete button    | `--accent-error`   |

---

### **3.17 AudioPanel (DM)**

| Element         | Tokens             |
| --------------- | ------------------ |
| Slider track    | `--border-subtle`  |
| Slider fill     | `--accent-primary` |
| Mute toggle     | `--accent-error`   |
| Condition icons | `--accent-warning` |

---

### **3.18 SearchPanel**

| Element          | Tokens                  |
| ---------------- | ----------------------- |
| Input background | `--bg-surface`          |
| Input border     | `--border-subtle`       |
| Result highlight | `--accent-primary-soft` |
| Result title     | `--text-primary`        |
| Result snippet   | `--text-secondary`      |

---

### **3.19 JournalPanel**

| Element     | Tokens                  |
| ----------- | ----------------------- |
| Entry title | `--text-primary`        |
| Entry date  | `--text-muted`          |
| Entry hover | `--accent-primary-soft` |

---

### **3.20 HistoryPanel**

| Element       | Tokens             |
| ------------- | ------------------ |
| Timeline line | `--border-subtle`  |
| Event dot     | `--accent-primary` |
| Event text    | `--text-secondary` |

---

### **3.21 SettingsPanel**

| Element         | Tokens                                                 |
| --------------- | ------------------------------------------------------ |
| Section header  | `--text-secondary`                                     |
| Toggle active   | `--accent-primary`                                     |
| Toggle inactive | `--border-subtle`                                      |
| Persona label   | persona token (`--accent-dm`, `--accent-player`, etc.) |

---

### 4. Summary

This file provides:

- A **complete component → token mapping**
- Deterministic, implementation‑ready guidance
- Zero invented behaviour
- Full alignment with your theming, layout, and persona rules

It is the authoritative reference for applying the theme to the UI.
