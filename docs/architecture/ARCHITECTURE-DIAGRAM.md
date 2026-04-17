# **ARCHITECTURE-DIAGRAM.md**

# Architecture Diagram

This document provides a visual overview of the VTT‑Chat platform architecture.
It is designed to give developers a clear mental model of how the system is structured, how data flows, and how subsystems interact.

The diagrams below use **Mermaid** for readability and maintainability.
They are intentionally high‑level and conceptual, not implementation‑specific.

---

# 1. High‑Level System Overview

This diagram shows the major layers of the platform and how they relate.

```mermaid
flowchart TD

    subgraph Client["Client Application"]
        UI["UI Layer (React)"]
        Stores["State Stores (Zustand)"]
        Reducers["Event Reducers"]
        Transport["Transport Layer (WebSocket / Extension Bridge)"]
    end

    subgraph Server["Server"]
        Validator["Event Validator"]
        SessionMgr["Session Manager"]
        PresenceSvc["Presence Service"]
        AudioSvc["Audio Routing / Effects"]
        NotesSvc["Notes Service"]
        ChatSvc["Chat Service"]
        Persistence["Persistence Layer"]
    end

    subgraph Extension["Browser Extension"]
        Overlay["Injected Overlay UI"]
        Bridge["Extension Bridge"]
        VTT["External VTT (Foundry, Roll20, etc.)"]
    end

    UI --> Stores
    Stores --> UI

    UI --> Reducers
    Reducers --> Stores

    Reducers --> Transport
    Transport --> Validator

    Validator --> SessionMgr
    Validator --> PresenceSvc
    Validator --> AudioSvc
    Validator --> NotesSvc
    Validator --> ChatSvc

    SessionMgr --> Persistence
    NotesSvc --> Persistence
    ChatSvc --> Persistence

    VTT --> Overlay
    Overlay --> Bridge
    Bridge --> Transport
```

---

# 2. Event Flow Diagram

This diagram illustrates the **unidirectional event flow** that powers the entire system.

```mermaid
sequenceDiagram
    participant UI
    participant Reducer
    participant Store
    participant Transport
    participant Server
    participant Validator
    participant Broadcast

    UI->>Reducer: Dispatch Event
    Reducer->>Store: Compute next state
    Store->>UI: UI updates

    Reducer->>Transport: Forward event
    Transport->>Server: Send event
    Server->>Validator: Validate event
    Validator->>Broadcast: Broadcast to clients
    Broadcast->>Transport: Deliver event
    Transport->>Reducer: Feed into reducer pipeline
```

Key points:

- Events always flow **UI → Reducer → Store → UI** locally
- Networked events flow **Reducer → Transport → Server → Broadcast → Reducer**
- Reducers are pure and deterministic
- Stores are the canonical client state

---

# 3. Subsystem Interaction Diagram

This diagram shows how subsystems depend on each other.

```mermaid
flowchart LR

    Presence["Presence Subsystem"]
    Chat["Chat Subsystem"]
    Notes["Notes Subsystem"]
    Audio["Audio Subsystem"]
    LiveKit["LiveKit Integration"]
    Session["Session Manager"]
    Reducers["Event Reducers"]
    Stores["State Stores"]

    Reducers --> Presence
    Reducers --> Chat
    Reducers --> Notes
    Reducers --> Audio
    Reducers --> Session

    Presence --> Stores
    Chat --> Stores
    Notes --> Stores
    Audio --> Stores
    Session --> Stores

    LiveKit --> Audio
```

---

# 4. Client‑Side Architecture

This diagram focuses on the **frontend**.

```mermaid
flowchart TD

    UI["React UI Components"]
    Selectors["Selectors"]
    Stores["Zustand Stores"]
    Reducers["Event Reducers"]
    Transport["Transport Layer"]

    UI --> Selectors
    Selectors --> Stores

    UI --> Reducers
    Reducers --> Stores

    Reducers --> Transport
```

Notes:

- UI reads state via **selectors**
- UI writes state via **reducers**
- Reducers are the only way to mutate state
- Transport sends events to the server or extension

---

# 5. Extension Architecture

This diagram shows how the browser extension integrates with the core app and the VTT.

```mermaid
flowchart LR

    Core["VTT‑Chat Core App"]
    Bridge["Extension Bridge"]
    Overlay["Injected Overlay UI"]
    VTT["External VTT"]

    Core <--> Bridge
    Bridge <--> Overlay
    Overlay <--> VTT
```

Key points:

- The extension acts as a **bridge** between the core app and the VTT
- The overlay is injected into the VTT DOM
- The extension can read/write VTT state depending on permissions

---

# 6. Data Persistence Diagram

```mermaid
flowchart TD

    Server["Server"]
    DB["Database"]
    Cache["In‑Memory Cache"]

    Server --> DB
    Server --> Cache
    Cache --> Server
```

Persistence is used for:

- Notes
- Session metadata
- Chat logs (optional)
- User profiles
- Audio preset libraries

---

# 7. Summary

The architecture is designed to be:

- **Predictable** — unidirectional data flow
- **Modular** — subsystems are isolated
- **Extensible** — new subsystems can be added without breaking others
- **Transport‑agnostic** — works with WebSockets, extension bridges, or local dispatch
- **Debuggable** — reducers and events are fully traceable

This diagram serves as the visual foundation for understanding the entire platform.
