# **COMBINED PERSONA COMPARISON SHEET**

> _DM vs Player vs Spectator — Full UI, Capability & Interaction Matrix_

---

## 1. Overview

This sheet defines:

- What each persona **can see**
- What each persona **can do**
- What each persona **cannot do**
- Which components are **visible**, **interactive**, or **hidden**
- How motion, popouts, and panels behave per persona
- How the layout changes per persona

This is the **single source of truth** for persona‑based UI behaviour.

---

## 2. High‑Level Persona Summary

| Persona       | Role                                                  | Interaction Level | UI Complexity |
| ------------- | ----------------------------------------------------- | ----------------- | ------------- |
| **DM**        | Full control of rooms, players, audio, notes, history | Full              | Highest       |
| **Player**    | Participates in chat, notes, journal                  | Medium            | Moderate      |
| **Spectator** | Observes only                                         | None              | Lowest        |

---

## 3. Layout Comparison

| Region                     | DM                            | Player            | Spectator                     |
| -------------------------- | ----------------------------- | ----------------- | ----------------------------- |
| **Toolbar**                | ✔ Full                        | ✔ Full            | ✔ Simplified                  |
| **DM Voice Bar**           | ✔ Visible                     | ✖ Hidden          | ✖ Hidden                      |
| **Left Rail**              | ✔ Rooms + Players + Overrides | ✔ Rooms + Players | ✔ Rooms + Players (read‑only) |
| **Center Pane**            | ✔ Chat Only                   | ✔ Chat Only       | ✔ Chat Only (read‑only)       |
| **Composer**               | ✔ Visible                     | ✔ Visible         | ✖ Hidden                      |
| **Right Rail (Icon Tabs)** | ✔ All Tabs                    | ✔ Limited Tabs    | ✖ Hidden                      |
| **Right Panel (Slide‑In)** | ✔ All Panels                  | ✔ Limited Panels  | ✖ Hidden                      |

---

## 4. Component Visibility Matrix

### **4.1 Top‑Level Components**

| Component       | DM  | Player      | Spectator   |
| --------------- | --- | ----------- | ----------- |
| Toolbar         | ✔   | ✔           | ✔ (reduced) |
| DM Voice Bar    | ✔   | ✖           | ✖           |
| Left Rail       | ✔   | ✔           | ✔           |
| Center Pane     | ✔   | ✔           | ✔           |
| Composer        | ✔   | ✔           | ✖           |
| Right Rail Tabs | ✔   | ✔ (reduced) | ✖           |
| Right Panel     | ✔   | ✔ (reduced) | ✖           |

---

### **4.2 Right Rail Tabs**

| Tab      | DM  | Player | Spectator |
| -------- | --- | ------ | --------- |
| Rooms    | ✔   | ✖      | ✖         |
| Journal  | ✔   | ✔      | ✖         |
| Notes    | ✔   | ✔      | ✖         |
| History  | ✔   | ✔      | ✖         |
| Search   | ✔   | ✔      | ✖         |
| Settings | ✔   | ✔      | ✖         |

---

### **4.3 Slide‑In Panels**

| Panel                   | DM  | Player                       | Spectator |
| ----------------------- | --- | ---------------------------- | --------- |
| Rooms Panel             | ✔   | ✖                            | ✖         |
| Player Management Panel | ✔   | ✖                            | ✖         |
| Notes Panel             | ✔   | ✔ (read‑only)                | ✖         |
| Journal Panel           | ✔   | ✔ (read‑only unless allowed) | ✖         |
| History Panel           | ✔   | ✔ (filtered)                 | ✖         |
| Search Panel            | ✔   | ✔ (filtered)                 | ✖         |
| Settings Panel          | ✔   | ✔                            | ✖         |

---

## 5. Interaction Capability Matrix

### **5.1 Chat**

| Action           | DM  | Player         | Spectator |
| ---------------- | --- | -------------- | --------- |
| Send message     | ✔   | ✔              | ✖         |
| Whisper          | ✔   | ✔              | ✖         |
| Slash commands   | ✔   | ✔ (limited)    | ✖         |
| Insert note card | ✔   | ✔ (if allowed) | ✖         |
| Delete message   | ✔   | ✖              | ✖         |
| Edit message     | ✔   | ✖              | ✖         |

---

### **5.2 Notes**

| Action            | DM  | Player                   | Spectator     |
| ----------------- | --- | ------------------------ | ------------- |
| Create note       | ✔   | ✔ (personal/shared only) | ✖             |
| Edit note         | ✔   | ✔ (own only)             | ✖             |
| Delete note       | ✔   | ✔ (own only)             | ✖             |
| Change visibility | ✔   | ✖                        | ✖             |
| View note         | ✔   | ✔                        | ✔ (read‑only) |

---

### **5.3 Rooms**

| Action                     | DM  | Player | Spectator |
| -------------------------- | --- | ------ | --------- |
| Create room                | ✔   | ✖      | ✖         |
| Rename room                | ✔   | ✖      | ✖         |
| Delete room                | ✔   | ✖      | ✖         |
| Change environment         | ✔   | ✖      | ✖         |
| Move players between rooms | ✔   | ✖      | ✖         |
| View rooms                 | ✔   | ✔      | ✔         |

---

### **5.4 Player Controls**

| Action               | DM  | Player | Spectator |
| -------------------- | --- | ------ | --------- |
| Adjust gain          | ✔   | ✖      | ✖         |
| Mute player          | ✔   | ✖      | ✖         |
| Apply condition      | ✔   | ✖      | ✖         |
| Apply distance       | ✔   | ✖      | ✖         |
| Whisper              | ✔   | ✔      | ✖         |
| View speaking status | ✔   | ✔      | ✔         |

---

## 6. Audio & Voice Controls

| Feature                 | DM  | Player | Spectator |
| ----------------------- | --- | ------ | --------- |
| Voice presets           | ✔   | ✖      | ✖         |
| Push‑to‑talk            | ✔   | ✔      | ✖         |
| Clear all voice effects | ✔   | ✖      | ✖         |
| Player gain control     | ✔   | ✖      | ✖         |
| Player mute             | ✔   | ✖      | ✖         |
| Audio environment       | ✔   | ✖      | ✖         |

---

## 7. Motion & Animation Rules

| Motion              | DM  | Player | Spectator   |
| ------------------- | --- | ------ | ----------- |
| Slide‑in panels     | ✔   | ✔      | ✖           |
| Hover animations    | ✔   | ✔      | ✖           |
| Press animations    | ✔   | ✔      | ✖           |
| Drag‑drop           | ✔   | ✖      | ✖           |
| Note popout         | ✔   | ✔      | Fade‑only   |
| Reduced motion mode | ✔   | ✔      | ✔ (default) |

Spectator defaults to **reduced motion** for clarity and readability.

---

## 8. Token Usage Differences

| Token Category        | DM          | Player          | Spectator          |
| --------------------- | ----------- | --------------- | ------------------ |
| Backgrounds           | ✔           | ✔               | ✔                  |
| Text                  | ✔           | ✔               | ✔                  |
| Persona accents       | ✔ DM accent | ✔ Player accent | ✔ Spectator accent |
| Error/warning/success | ✔           | ✔               | ✔                  |
| Accent-primary        | ✔           | ✔               | ✔                  |
| Accent-primary-soft   | ✔           | ✔               | ✔ (reduced motion) |

Spectator uses the same tokens but **fewer interactive states**.

---

## 9. Layout Differences (Figma‑Ready)

| Region       | DM     | Player | Spectator        |
| ------------ | ------ | ------ | ---------------- |
| Right Rail   | 56px   | 56px   | 0px              |
| Right Panel  | 360px  | 360px  | 0px              |
| Composer     | 48px   | 48px   | 0px              |
| DM Voice Bar | 56px   | 0px    | 0px              |
| Left Rail    | 240px  | 240px  | 240px            |
| Center Pane  | flex‑1 | flex‑1 | flex‑1 (largest) |

Spectator gets the **widest possible chat area**.

---

## 10. Component Library Differences

| Component    | DM          | Player          | Spectator          |
| ------------ | ----------- | --------------- | ------------------ |
| Toolbar      | Variant: DM | Variant: Player | Variant: Spectator |
| Left Rail    | Variant: DM | Variant: Player | Variant: Spectator |
| Chat Message | Variant: DM | Variant: Player | Variant: Spectator |
| Note Card    | Variant: DM | Variant: Player | Variant: Spectator |
| Right Rail   | Full        | Reduced         | Hidden             |
| Right Panel  | Full        | Reduced         | Hidden             |
| Composer     | Full        | Full            | Hidden             |

---

## **Combined Persona Comparison Sheet Complete**

This is the **authoritative persona matrix** for your entire UI system.

It is:

- Figma‑ready
- Engineering‑ready
- QA‑ready
- Documentation‑ready
- Deterministic
- Persona‑accurate
- Fully aligned with your architecture
