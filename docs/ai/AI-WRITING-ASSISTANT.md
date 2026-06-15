# AI Writing Assistant

Status: Planned. Tracked as `W-AI-Writing-Assistant` in ROADMAP.md.

This document defines the architecture, UI contract, privacy model, and capability gate for the in-editor AI writing assistant surfaced through the "Ask AI" button in the Notes and Journal markdown editor.

---

## 1. Goals

- Give DMs and players AI-assisted authoring within the markdown editor without requiring cloud infrastructure.
- Surface session context (summaries, timeline windows) as ambient AI knowledge when available, with no manual configuration required from the user.
- Keep the feature independently functional — it does not require the recording/transcription pipeline to be installed.
- Respect all existing privacy and role boundaries: private notes stay private, off-the-record content stays off-the-record.

---

## 2. Relationship to Other AI Features

The AI Writing Assistant and the Recording/Transcription/Summary pipeline are separate features that share an AI provider abstraction layer.

| Feature                           | Depends on recording? | Depends on AI provider? |
| --------------------------------- | --------------------- | ----------------------- |
| W-Recording-Transcription-Summary | Yes                   | Yes (local or cloud)    |
| W-AI-Writing-Assistant            | No                    | Yes (local or cloud)    |

When both features are installed, the writing assistant automatically uses available session summaries as context. When only the writing assistant is installed (no recording pipeline), it operates on the current note content and whatever campaign context the user supplies in the prompt.

---

## 3. Capability Gate

The writing assistant is gated by AI provider availability, not by `VTTCHAT_SUMMARY_PROCESSING_ENABLED`.

| Condition                                  | UI state                                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No AI provider configured                  | "Ask AI" button disabled; tooltip: "No AI provider configured. An administrator can enable a local or cloud AI model in system settings." |
| Local AI configured                        | Button enabled; all requests handled locally                                                                                              |
| Cloud AI configured (opt-in)               | Button enabled; first use per campaign prompts consent confirmation                                                                       |
| `VTTCHAT_SUMMARY_PROCESSING_ENABLED=false` | Button remains enabled if an AI provider is configured; session context simply unavailable                                                |

---

## 4. AI Provider Abstraction

Both features (writing assistant and summary pipeline) share a single provider abstraction. The provider is configured once per deployment and applies to both.

| Provider type | Technology examples                          | Data leaves machine?          |
| ------------- | -------------------------------------------- | ----------------------------- |
| Local LLM     | llama.cpp, Mistral, Phi-3                    | Never                         |
| Cloud LLM     | Operator-configured (e.g. Anthropic, OpenAI) | Yes — text only, with consent |

The abstraction layer exposes a single interface to both features:

```ts
interface AiProvider {
  complete(prompt: AiPrompt, options?: AiOptions): Promise<AiResponse>
  stream?(prompt: AiPrompt, options?: AiOptions): AsyncIterable<string>
  isAvailable(): boolean
}
```

Streaming is preferred for responsiveness. Single-response fallback is used when the local model does not support streaming.

---

## 5. Capabilities

The writing assistant responds to natural language prompts entered in the inline panel. Supported operations:

| Operation           | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| Expand text         | Elaborate on selected content in the same style                            |
| Condense text       | Summarise selected content into fewer words                                |
| Rewrite             | Rephrase in a different tone (e.g. "make this more dramatic")              |
| Continue            | Suggest narrative continuation from the cursor position                    |
| Generate DMDX block | Create any of the 9 DMDX block types from a plain-language description     |
| Session recap       | Generate a "Previously on…" passage from available session summary context |
| Q&A                 | Answer questions about session history when context is available           |

DMDX block generation must target only supported v1 block types (`npc`, `monster`, `encounter`, `loot`, `spell`, `session`, `roll`, `map`, `timeline`) as defined in `docs/subsystems/DMDX-MARKDOWN-EXTENSION.md`. Generated blocks must be warning-safe and parser-compatible.

---

## 6. Context Injection

The assistant injects context into each prompt automatically, in priority order:

1. **User's prompt** — the explicit instruction
1. **Selected text** — content highlighted in the editor at time of prompt (if any)
1. **Current note/journal content** — the full document being edited (truncated if needed)
1. **Session summary** — injected silently when available from the summary pipeline; not shown to the user

Context injection is silent — the user sees only the prompt and the result. No raw session data or note content is displayed inside the prompt panel.

Privacy filter applied before any context is assembled:

- DM-private notes are never included in context for non-DM users
- Whisper bubble content is never included in any context regardless of role
- Off-the-record pause content follows the same exclusion rules as the summary pipeline

---

## 7. UI Contract

### Toolbar button

- Label: "Ask AI"
- Position: Notes and Journal editor toolbar, rightmost group
- State: enabled / disabled (see §3)
- Available in both rich markdown mode and raw code view

### Inline prompt panel

- Opens inline below the toolbar; does not obscure the editor content
- Non-blocking — user can continue editing while the panel is open
- Contains: a single-line or multi-line prompt input, a "Generate" action, a "Close" action
- Output renders as a diff-preview below the input: new content shown with a subtle highlight
- User actions on output: "Accept" (inserts at cursor or replaces selection) or "Discard" (clears output, prompt remains)
- Streaming output renders token-by-token; a loading indicator is shown until the first token arrives

### Role restrictions

- DM: full access in Notes and Journal
- Player: access in their own private Notes only
- Spectator: no access

---

## 8. Privacy Model

| Scenario                        | Behaviour                                                         |
| ------------------------------- | ----------------------------------------------------------------- |
| Local AI, any note              | Note content stays on machine; no consent prompt needed           |
| Cloud AI, first use in campaign | One-time explicit consent confirmation before any content is sent |
| Cloud AI, subsequent uses       | Content sent without re-prompting unless consent is revoked       |
| DM-private note, cloud AI       | Consent confirmation must make clear this is a private note       |
| Whisper content                 | Excluded from all AI context; never sent regardless of provider   |

Consent state is stored per campaign, per user. Revoking consent in campaign settings clears it for all future uses in that campaign.

---

## 9. API Contract

The writing assistant uses a backend relay endpoint so that API credentials are never exposed to the frontend.

```text
POST /api/ai/complete
```

Request body:

```ts
interface AiCompleteRequest {
  prompt: string
  context?: {
    selectedText?: string
    noteContent?: string
    sessionSummary?: string
  }
  operation?: 'expand' | 'condense' | 'rewrite' | 'continue' | 'generate-dmdx' | 'qa'
  dmdxBlockType?: string
  stream?: boolean
}
```

Response (non-streaming):

```ts
interface AiCompleteResponse {
  output: string
  provider: 'local' | 'cloud'
  truncated?: boolean
}
```

Response (streaming): `text/event-stream` with `data: <token>` lines, terminated by `data: [DONE]`.

The backend relay applies the same privacy filter as the context injection logic (§6) before forwarding to the provider. The frontend does not assemble the final prompt — it sends raw context fields and lets the backend construct and sanitize the full prompt.

---

## 10. Acceptance Criteria

- "Ask AI" button present in Notes and Journal editor toolbar
- Button disabled with explanatory tooltip when no AI provider is configured
- Inline prompt panel opens without obscuring the editor or requiring a full-screen mode
- Local AI responds without any cloud dependency when a local model is configured
- Cloud AI opt-in consent shown on first use per campaign; revocable in campaign settings
- Output rendered as diff-preview; user must accept or discard before content is written to the note
- Session summary context injected automatically and silently when available
- All 9 DMDX block types can be generated by name in the prompt
- DM-private and Whisper content excluded from AI context regardless of provider
- Feature remains fully functional when `VTTCHAT_SUMMARY_PROCESSING_ENABLED=false`
- Streaming output renders token-by-token with loading indicator on first token
- Backend relay endpoint never exposes AI provider credentials to the frontend

---

## 11. Related Documents

- [NOTES-SYSTEM.md](docs/subsystems/NOTES-SYSTEM.md)
- [DMDX-MARKDOWN-EXTENSION.md](docs/subsystems/DMDX-MARKDOWN-EXTENSION.md)
- [TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)
- [AI-CONTEXT-SUMMARY-PROCESSING.md](docs/ai/AI-CONTEXT-SUMMARY-PROCESSING.md)
- [PRIVACY-MODEL.md](docs/philosophy/PRIVACY-MODEL.md)
