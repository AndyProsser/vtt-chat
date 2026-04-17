# **REACT-COMPONENT-TREES.md**

_Persona‑specific component architecture for VTT‑Chat._

---

# 🧱 **0. Shared Core Layout (All Personas)**

Every persona uses the same **root layout**, but with different props, permissions, and visibility rules.

```
<App>
  <TopBar />
  <MainLayout>
    <LeftRail>
      <PlayerList />
    </LeftRail>

    <CenterPane>
      <ChatWindow />
      <MessageComposer />
      <DMVoicePanel /> (DM only)
    </CenterPane>

    <RightRail>
      <RightTabBar />
      <SlideInPanels />
    </RightRail>
  </MainLayout>
</App>
```

---

# 🎭 **1. DM Component Tree (Full Command Centre)**

DM gets the **full cockpit** — all controls, all panels, all interactions.

```
<DMApp>
  <TopBar
    showSessionTimer
    showConnectionStatus
    showDMControls
  />

  <DMVoicePanel />   // voice presets + clear

  <MainLayout>
    <LeftRail expanded>
      <PlayerList mode="dm">
        <PlayerItem>
          <Avatar />
          <PlayerInfo />
          <SpeakingIndicator />
          <MuteIndicator />
          <ConditionIcons />
          <PlayerOverrides />   // gain/mute/distance/conditions
        </PlayerItem>
      </PlayerList>
    </LeftRail>

    <CenterPane>
      <ChatWindow persona="dm" />
      <MessageComposer persona="dm" />
    </CenterPane>

    <RightRail>
      <RightTabBar
        tabs={[
          "rooms",
          "audio",
          "search",
          "notes",
          "journal",
          "history",
          "settings"
        ]}
      />

      <SlideInPanels>
        <RoomsPanel />
        <AudioPanel />
        <SearchPanel />
        <NotesPanel />
        <JournalPanel />
        <HistoryPanel />
        <SettingsPanel />
      </SlideInPanels>
    </RightRail>
  </MainLayout>
</DMApp>
```

### **DM‑Only Components**

- `<DMVoicePanel />`
- `<RoomsPanel />`
- `<AudioPanel />`
- `<PlayerOverrides />`
- `<RoomEnvironmentMenu />`
- `<BulkAudioActions />`
- `<DMCommandAutocomplete />`

---

# 🎮 **2. Player Component Tree (Immersive Cockpit)**

Players get a **clean, minimal, immersive** UI.

```
<PlayerApp>
  <TopBar
    showSessionTimer
    showConnectionStatus
  />

  <MainLayout>
    <LeftRail collapsed>
      <PlayerList mode="player">
        <PlayerItem>
          <Avatar />
          <PlayerInfo />
          <SpeakingIndicator />
          <MuteIndicator />
          <ConditionIcons />
        </PlayerItem>
      </PlayerList>
    </LeftRail>

    <CenterPane>
      <ChatWindow persona="player" />
      <MessageComposer persona="player" />
    </CenterPane>

    <RightRail>
      <RightTabBar
        tabs={[
          "notes",
          "journal",
          "search",
          "history",
          "settings"
        ]}
      />

      <SlideInPanels>
        <NotesPanel />
        <JournalPanel readOnly />
        <SearchPanel />
        <HistoryPanel readOnly />
        <SettingsPanel personalOnly />
      </SlideInPanels>
    </RightRail>
  </MainLayout>
</PlayerApp>
```

### **Player‑Only Components**

- `<PlayerNoteEditor />`
- `<PlayerNoteShareMenu />`
- `<PlayerCommandAutocomplete />`

---

# 👁️ **3. Spectator Component Tree (Observation Deck)**

Spectators get the **cleanest** UI — read‑only everything.

```
<SpectatorApp>
  <TopBar
    showSessionTimer
    showConnectionStatus
  />

  <MainLayout>
    <LeftRail collapsed>
      <PlayerList mode="spectator">
        <PlayerItem>
          <Avatar />
          <PlayerInfo />
          <SpeakingIndicator />
          <ConditionIcons />
        </PlayerItem>
      </PlayerList>
    </LeftRail>

    <CenterPane>
      <ChatWindow persona="spectator" readOnly />
      <SpectatorMessageBlocker />
    </CenterPane>

    <RightRail>
      <RightTabBar
        tabs={[
          "notes",
          "journal",
          "search",
          "history",
          "settings"
        ]}
      />

      <SlideInPanels>
        <NotesPanel readOnly globalOnly />
        <JournalPanel readOnly />
        <SearchPanel readOnly />
        <HistoryPanel readOnly />
        <SettingsPanel personalOnly />
      </SlideInPanels>
    </RightRail>
  </MainLayout>
</SpectatorApp>
```

### **Spectator‑Only Components**

- `<SpectatorMessageBlocker />`
- `<ReadOnlyNoteViewer />`

---

# 🧩 **4. Shared Component Library**

These are the **atoms**, **molecules**, and **organisms** used across all personas.

### **Atoms**

```
<Avatar />
<Icon />
<Badge />
<Button />
<Toggle />
<Slider />
<Divider />
<Timestamp />
<Tooltip />
```

### **Molecules**

```
<PlayerItem />
<PlayerInfo />
<PlayerOverrides />
<ConditionIcons />
<SpeakingIndicator />
<MessageBubble />
<CommandAutocomplete />
<RightTab />
```

### **Organisms**

```
<PlayerList />
<ChatWindow />
<MessageComposer />
<DMVoicePanel />
<RightTabBar />
<SlideInPanels />
<NotesPanel />
<JournalPanel />
<HistoryPanel />
<SearchPanel />
<SettingsPanel />
<RoomsPanel />
<AudioPanel />
```

### **Layouts**

```
<TopBar />
<MainLayout />
<LeftRail />
<CenterPane />
<RightRail />
```

---

# 🧠 **5. Persona Differences Summary**

| Component       | DM   | Player              | Spectator  |
| --------------- | ---- | ------------------- | ---------- |
| PlayerList      | Full | Simplified          | Simplified |
| PlayerOverrides | ✔    | ✖                   | ✖          |
| DMVoicePanel    | ✔    | ✖                   | ✖          |
| RoomsPanel      | ✔    | ✖                   | ✖          |
| AudioPanel      | ✔    | ✖                   | ✖          |
| NotesPanel      | Full | Editable + sharable | Read‑only  |
| JournalPanel    | Full | Read‑only           | Read‑only  |
| HistoryPanel    | Full | Read‑only           | Read‑only  |
| MessageComposer | Full | Full                | ✖          |
| Commands        | Full | Partial             | ✖          |

---

# 🚀 Next Step Options

We can now go deeper in any direction:

### **A. Component Props & Interfaces**

Define TypeScript interfaces for every component.

### **B. Zustand Store → Component Mapping**

Which store drives which component.

### **C. Animation & Motion Spec**

Slide‑in panels, hover states, drag‑drop micro‑interactions.

### **D. Command System Specification**

Full grammar, autocomplete, error handling.

### **E. File/Folder Structure**

Organize the entire SPA into a clean, scalable directory tree.

Which one do you want to tackle next?
