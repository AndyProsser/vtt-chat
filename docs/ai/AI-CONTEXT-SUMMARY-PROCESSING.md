# **AI‑CONTEXT: Audio Recording, Transcription & Timeline Merge for vtt‑chat**

## **Purpose**

This document defines the architecture, data models, algorithms, and worker pipelines required to add:

- Local audio recording
- Offline transcription
- Multi‑source timeline merging
- Session summary generation

to the **vtt‑chat** platform.

This context is used by AI agents contributing to the codebase.

---

## **1. High‑Level Architecture**

### **Components**

- **LiveKit** — audio capture
- **recording‑ingest service** — receives LiveKit webhooks, downloads audio
- **transcription‑worker** — runs Whisper.cpp or FasterWhisper locally
- **timeline‑merge service** — merges audio, chat, system events
- **summarisation‑worker** — optional local/cloud LLM summarisation
- **Node.js backend** — orchestrates jobs, stores results
- **Docker** — containerised deployment for home users

### **Processing Flow**

1. Session ends
2. LiveKit sends `recording.finished`
3. `recording‑ingest` downloads audio tracks
4. `transcription‑worker` produces transcript segments
5. `timeline‑merge` merges transcript + chat + system events
6. `summarisation‑worker` generates summaries
7. Frontend fetches results via API

---

## **2. Data Models**

### **2.1 Canonical Timeline Event Model**

```ts
type TimelineEventType = 'audio' | 'chat' | 'game' | 'system'

interface BaseEvent {
  id: string
  ts: number // ms since session start
  type: TimelineEventType
  source: string // "livekit", "vtt-chat", etc.
}

interface AudioEvent extends BaseEvent {
  type: 'audio'
  speakerId: string
  speakerName: string
  text: string
  confidence?: number
  raw?: unknown
}

interface ChatEvent extends BaseEvent {
  type: 'chat'
  senderId: string
  senderName: string
  text: string
  channel: 'ooc' | 'ic' | 'gm' | 'system'
}

interface GameEvent extends BaseEvent {
  type: 'game'
  scope: 'combat' | 'exploration' | 'social' | 'loot' | 'meta'
  label: string
  payload: Record<string, unknown>
}

interface SystemEvent extends BaseEvent {
  type: 'system'
  kind: 'join' | 'leave' | 'room-change' | 'marker' | 'gm-note'
  details?: string
}

type TimelineEvent = AudioEvent | ChatEvent | GameEvent | SystemEvent
```

#### Notes

- **GameEvent** is included for future Foundry/DDB integration but not required.
- All events must be timestamped relative to session start.

---

## **3. Timeline Merge Algorithm**

### **3.1 Normalisation**

#### **Audio → AudioEvent**

- Convert Whisper segments to `AudioEvent`
- Map LiveKit track → participant → internal speaker ID
- Compute `ts = segment.start * 1000 + offset`

#### **Chat → ChatEvent**

- Direct mapping from vtt‑chat messages
- Preserve IC/OOC/GM channels

#### **System → SystemEvent**

- Player join/leave
- Room changes
- GM markers
- Manual bookmarks

#### **Game → GameEvent (optional future)**

- FoundryVTT hooks
- DDB limited metadata

---

### **3.2 Merge + Sort**

#### **Priority Order**

```ts
const TYPE_PRIORITY = {
  system: 0,
  game: 1,
  chat: 2,
  audio: 3,
}
```

#### **Sorting**

```ts
allEvents.sort((a, b) => {
  if (a.ts !== b.ts) return a.ts - b.ts
  const pa = TYPE_PRIORITY[a.type]
  const pb = TYPE_PRIORITY[b.type]
  if (pa !== pb) return pa - pb
  return a.id.localeCompare(b.id)
})
```

Result: a **canonical, deterministic timeline**.

---

## **4. Windowing (Optional but Recommended)**

### **4.1 Window Model**

```ts
interface TimelineWindow {
  id: string
  startTs: number
  endTs: number
  events: TimelineEvent[]
  tags: string[]
}
```

### **4.2 Window Boundaries**

A new window is created when:

- Time gap > N seconds (default: 60–120)
- Scene/room change
- Combat start/end (future)
- GM marker

### **4.3 Tagging Rules**

- Contains combat events → `combat`
- Contains social dialogue → `social`
- Contains exploration events → `exploration`
- Contains GM markers → `marker:<label>`

---

## **5. Summarisation Pipeline**

### **5.1 Window Payload for LLM**

```ts
interface LlmWindowPayload {
  startTs: number
  endTs: number
  summaryHint?: string
  items: {
    kind: 'speech' | 'chat' | 'action' | 'system'
    ts: number
    speaker?: string
    text: string
  }[]
}
```

#### Mapping

- `AudioEvent` → `speech`
- `ChatEvent` → `chat`
- `GameEvent` → `action`
- `SystemEvent` → `system`

### **5.2 Multi‑Pass Summarisation**

1. Summarise each window
2. Summarise window summaries into session summary
3. Generate:
   - Player summary
   - GM summary
   - Combat summary
   - Narrative summary
   - “Previously on…” recap

### **5.3 Local vs Cloud**

- Local: Llama.cpp, Mistral, Phi‑3
- Cloud: optional, user‑controlled

---

## **6. Worker Design**

### **6.1 recording‑ingest**

- Receives LiveKit webhook
- Downloads audio tracks
- Stores in `/data/recordings/<session>/<track>.wav`
- Creates transcription job

### **6.2 transcription‑worker**

- Runs Whisper.cpp
- Emits `AudioEvent[]`
- Writes to `/data/transcripts/<session>.json`

### **6.3 timeline‑merge**

- Loads:
  - Transcript
  - Chat logs
  - System events
- Produces:
  - `TimelineEvent[]`
  - Optional `TimelineWindow[]`

### **6.4 summarisation‑worker**

- Consumes windows
- Calls local/cloud LLM
- Stores summaries

---

## **7. Extensibility Hooks**

### **7.1 Future: FoundryVTT Integration**

- Capture combat logs
- Capture rolls
- Capture item usage
- Capture scene transitions
- Add structured `GameEvent`s

### **7.2 Future: D&D Beyond Integration**

- Character sheet metadata only
- No combat logs
- No event stream

---

## **8. Security & Privacy**

- Audio never leaves the user’s machine unless explicitly configured
- Summaries may be sent to cloud LLMs only with user opt‑in
- All processing is local by default
- No raw audio is uploaded

---

## **9. Developer Notes**

- All timestamps must be normalised to session start
- All IDs must be deterministic
- Sorting must be stable
- Timeline must be reproducible from raw inputs
- Summaries must be regenerable

---

## **10. Related Concepts**

- Timeline merge algorithm
- Transcription worker architecture
- Session summary pipeline
