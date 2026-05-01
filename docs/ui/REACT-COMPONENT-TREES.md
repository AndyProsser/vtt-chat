# **REACT-COMPONENT-TREES.md**

_Authoritative persona‑specific component architecture for VTT‑Chat._

---

## **0. Shared Root Layout (All Personas)**

All personas share the same structural skeleton.
Visibility and props differ by persona.

```jsx
<App persona="dm|player|spectator">
  <Toolbar />                     // audio devices, theme, connection
  <CampaignInfo />                // campaign name, DM, session, time
  <SystemToasts />                // dismissable, stacked

  {persona === 'dm' && <DMVoiceBar />}

  <MainLayout>
    <LeftRail>
      <PlayerList />
    </LeftRail>

    <CenterPane>
      <RoomHeader />
      <ChatNotesToggle />
      <ChatWindow />              // or NotesList depending on toggle
      <MessageComposer />         // hidden for spectator
    </CenterPane>

    <RightRail>
      <RightTabBar />             // persona‑specific tabs
      <SlideInPanels />           // persona‑specific panels
    </RightRail>
  </MainLayout>

  <NotePopout />                  // optional, appears when opened
</App>
```

---

## **1. DM Component Tree (Full Command Centre)**

DM gets **all components**, including overrides, room management, audio routing, and full notes.

```jsx
<DMApp>
  <Toolbar />
  <CampaignInfo />
  <SystemToasts />

  <DMVoiceBar />   // presets, env, conditions, distance, overrides, PTT

  <MainLayout>
    <LeftRail expanded>
      <PlayerList persona="dm">
        <PlayerItem>
          <Avatar />
          <PlayerInfo />
          <SpeakingIndicator />
          <MuteIndicator />
          <ConditionIcons />
          <PlayerOverrides />   // gain, mute, distance, conditions
        </PlayerItem>
      </PlayerList>
    </LeftRail>

    <CenterPane>
      <RoomHeader />
      <ChatNotesToggle />
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

      <SlideInPanels persona="dm">
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

  <NotePopout />   // DM can edit notes here
</DMApp>
```

---

## **2. Player Component Tree (Immersive Cockpit)**

Players get a **clean, minimal** UI with chat, notes, and personal settings.

```jsx
<PlayerApp>
  <Toolbar />
  <CampaignInfo />
  <SystemToasts />

  <MainLayout>
    <LeftRail collapsed>
      <PlayerList persona="player">
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
      <RoomHeader />
      <ChatNotesToggle />
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

      <SlideInPanels persona="player">
        <NotesPanel />
        <JournalPanel readOnly />
        <SearchPanel />
        <HistoryPanel readOnly />
        <SettingsPanel />
      </SlideInPanels>
    </RightRail>
  </MainLayout>

  <NotePopout />   // Player can view or edit depending on visibility
</PlayerApp>
```

---

## **3. Spectator Component Tree (Observation Deck)**

Spectators get **read‑only everything**.

```jsx
<SpectatorApp>
  <Toolbar />
  <CampaignInfo />
  <SystemToasts />

  <MainLayout>
    <LeftRail collapsed>
      <PlayerList persona="spectator">
        <PlayerItem>
          <Avatar />
          <PlayerInfo />
          <SpeakingIndicator />
          <ConditionIcons />
        </PlayerItem>
      </PlayerList>
    </LeftRail>

    <CenterPane>
      <RoomHeader />
      <ChatNotesToggle />
      <ChatWindow persona="spectator" readOnly />
      <SpectatorMessageBlocker />   // prevents input
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

      <SlideInPanels persona="spectator">
        <NotesPanel readOnly globalOnly />
        <JournalPanel readOnly />
        <SearchPanel readOnly />
        <HistoryPanel readOnly />
        <SettingsPanel />
      </SlideInPanels>
    </RightRail>
  </MainLayout>

  <NotePopout readOnly />   // global notes only
</SpectatorApp>
```

---

## **4. New/Updated Components (All Documented)**

These are **not new subsystems** — they are UI wrappers around existing behaviour.

### **4.1 `<SystemToasts />`**

- Renders dismissable toasts
- No state mutation
- Driven by UI store events

### **4.2 `<NotePopout />`**

- Reuses `<NotesPanel />` in isolated mode
- Persona‑aware (DM edit, Player conditional, Spectator read‑only)

### **4.3 `<ChatNotesToggle />`**

- Simple UI toggle
- No new logic

### **4.4 `<RoomHeader />`**

- Displays current room
- Whisper target (if applicable)

These components already exist conceptually in your docs — this is just their placement.

---

## **5. Persona Differences Summary**

| Component       | DM   | Player  | Spectator |
| --------------- | ---- | ------- | --------- |
| Toolbar         | ✔    | ✔       | ✔         |
| CampaignInfo    | ✔    | ✔       | ✔         |
| SystemToasts    | ✔    | ✔       | ✔         |
| DMVoiceBar      | ✔    | ✖       | ✖         |
| PlayerOverrides | ✔    | ✖       | ✖         |
| MessageComposer | ✔    | ✔       | ✖         |
| NotesPanel      | Full | Partial | RO        |
| NotePopout      | Full | Partial | RO        |
| RoomsPanel      | ✔    | ✖       | ✖         |
| AudioPanel      | ✔    | ✖       | ✖         |
| SettingsPanel   | ✔    | ✔       | ✔         |
