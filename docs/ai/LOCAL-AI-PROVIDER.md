# Local AI Provider

Status: Planned architecture. Applies to both `W-Recording-Transcription-Summary` and `W-AI-Writing-Assistant`.

This document defines the local AI serving stack, model selection, Docker configuration, GPU support, and admin UI controls for all AI features in vtt-chat.

---

## 1. Two-Model Architecture

AI in vtt-chat serves two distinct workloads with different requirements:

| Role                | Used by                              | Priority           | Acceptable latency     |
| ------------------- | ------------------------------------ | ------------------ | ---------------------- |
| **Summary model**   | Post-session summarization pipeline  | Quality over speed | Minutes per session    |
| **Assistant model** | "Ask AI" in-editor writing assistant | Speed over quality | <3 seconds first token |

These are configured independently and may use different models. On CPU, a smaller assistant model is critical to stay below the 3-second threshold. On GPU, the same model can serve both roles at acceptable speed.

---

## 2. Serving Layer: Ollama

**Ollama** is the recommended serving layer for local LLMs. It is not used for Whisper transcription (see §5).

Reasons for choosing Ollama:

- Single Docker image; automatic GPU detection via NVIDIA Container Toolkit or AMD ROCm
- OpenAI-compatible REST API — provider abstraction requires minimal implementation
- Built-in model management: pull, delete, list, and status via API
- Supports streaming (`/api/generate`, `/api/chat` with `stream: true`)
- Can serve multiple models concurrently (controlled by `OLLAMA_NUM_PARALLEL`)
- Models stored in a named Docker volume — survive container restarts

Ollama serves **only text generation** (LLMs). Whisper transcription runs in a separate container (§5).

---

## 3. Model Recommendations

### 3.1 CPU-Only Deployment

All models listed as GGUF Q4_K_M quantization unless noted. Tested assumptions: 8–16 GB RAM, modern x86 CPU.

**Summary model** (quality over speed):

| Model                              | Size    | VRAM/RAM | Quality | Speed (tok/s) |
| ---------------------------------- | ------- | -------- | ------- | ------------- |
| `mistral:7b-instruct-q4_K_M`       | ~4.1 GB | 5 GB     | ★★★★☆   | ~5–8          |
| `llama3.1:8b-instruct-q4_K_M`      | ~4.7 GB | 6 GB     | ★★★★☆   | ~4–6          |
| `phi3:medium-128k-instruct-q4_K_M` | ~8.0 GB | 9 GB     | ★★★★★   | ~2–4          |

Recommendation: **`mistral:7b-instruct-q4_K_M`** — best quality-to-RAM ratio for batch summarization on CPU.

**Assistant model** (speed over quality, real-time):

| Model                         | Size    | VRAM/RAM | Quality | Speed (tok/s) |
| ----------------------------- | ------- | -------- | ------- | ------------- |
| `phi3.5:mini-instruct-q4_K_M` | ~2.2 GB | 3 GB     | ★★★☆☆   | ~15–25        |
| `qwen2.5:3b-instruct-q4_K_M`  | ~1.9 GB | 2.5 GB   | ★★★☆☆   | ~20–35        |
| `gemma2:2b-instruct-q4_K_M`   | ~1.6 GB | 2 GB     | ★★★☆☆   | ~25–40        |

Recommendation: **`phi3.5:mini-instruct-q4_K_M`** — fastest first token on CPU while maintaining acceptable DMDX and prose generation quality.

### 3.2 GPU-Backed Deployment

With a dedicated GPU, the speed constraint on the assistant model relaxes significantly. A single model can serve both roles if GPU VRAM permits.

| GPU VRAM | Summary model             | Assistant model      | Notes                           |
| -------- | ------------------------- | -------------------- | ------------------------------- |
| 6 GB     | `phi3.5:mini` (FP16)      | same                 | Tight; keep summary model at Q4 |
| 8 GB     | `mistral:7b` (Q8)         | `phi3.5:mini` (FP16) | Comfortable; two models loaded  |
| 12 GB    | `mistral:7b` (FP16)       | same model           | One model serves both           |
| 16 GB    | `llama3.1:8b` (FP16)      | same model           | High quality across both        |
| 24 GB    | `mistral-nemo:12b` (FP16) | `phi3.5:mini` (FP16) | Excellent summaries             |
| 48 GB+   | `llama3.1:70b` (Q4)       | `mistral:7b` (FP16)  | Near-cloud quality              |

Recommendation for a typical powerful home GPU (RTX 3090/4090, 24 GB): **`mistral-nemo:12b-instruct-fp16`** for summarization, **`phi3.5:mini-instruct-fp16`** for real-time assistance.

GPU inference typically reaches 40–100 tokens/second — fast enough that the assistant model constraint disappears and quality becomes the primary selector.

---

## 4. Docker Compose Configuration

### 4.1 CPU-Only

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - '11434:11434'
    environment:
      OLLAMA_NUM_PARALLEL: '2'
      OLLAMA_MAX_LOADED_MODELS: '2'
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:11434/api/tags']
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ollama-models:
```

### 4.2 GPU-Backed (NVIDIA)

Requires NVIDIA Container Toolkit installed on the host (`nvidia-container-toolkit`).

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - '11434:11434'
    environment:
      OLLAMA_NUM_PARALLEL: '2'
      OLLAMA_MAX_LOADED_MODELS: '2'
      OLLAMA_GPU_OVERHEAD: '200000000' # 200 MB VRAM reserved for system
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:11434/api/tags']
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ollama-models:
```

### 4.3 GPU-Backed (AMD ROCm)

```yaml
services:
  ollama:
    image: ollama/ollama:rocm
    volumes:
      - ollama-models:/root/.ollama
    ports:
      - '11434:11434'
    devices:
      - /dev/kfd
      - /dev/dri
    group_add:
      - video
    environment:
      OLLAMA_NUM_PARALLEL: '2'
    restart: unless-stopped
```

### 4.4 Backend Environment Variables

```env
# AI provider type
AI_PROVIDER_TYPE=local-ollama

# Ollama endpoint (Docker service name resolves internally)
AI_PROVIDER_URL=http://ollama:11434

# Model assignments
AI_SUMMARY_MODEL=mistral:7b-instruct-q4_K_M
AI_ASSISTANT_MODEL=phi3.5:mini-instruct-q4_K_M

# Timeouts (ms)
AI_SUMMARY_TIMEOUT_MS=300000      # 5 min for batch summary
AI_ASSISTANT_TIMEOUT_MS=30000     # 30 s for interactive response

# Cloud AI (leave blank to disable)
AI_CLOUD_PROVIDER=
AI_CLOUD_API_KEY=
AI_CLOUD_SUMMARY_MODEL=
AI_CLOUD_ASSISTANT_MODEL=
```

---

## 5. Transcription: Whisper (Separate Container)

Whisper transcription is handled by a dedicated worker container — it does not go through Ollama, which only handles text LLMs.

### 5.1 Technology

**faster-whisper** (CTranslate2 backend) is recommended over whisper.cpp for Docker deployments because:

- Better CPU batching performance
- Native CUDA/ROCm support in the same image
- Python-native, easier to integrate into the Node.js transcription worker via subprocess or sidecar

Alternative: **whisper.cpp** if a statically-linked binary with minimal dependencies is preferred.

### 5.2 Model Selection

| Whisper model | Size   | WER (English) | CPU speed    | GPU speed    |
| ------------- | ------ | ------------- | ------------ | ------------ |
| `tiny`        | 39 MB  | High error    | Real-time    | Real-time    |
| `base`        | 74 MB  | Moderate      | Real-time    | Real-time    |
| `small`       | 244 MB | Good          | ~2× realtime | Real-time    |
| `medium`      | 769 MB | Very good     | ~4× realtime | Real-time    |
| `large-v3`    | 1.5 GB | Best          | ~8× realtime | ~2× realtime |

Recommendation:

- CPU-only: **`small`** — best speed/accuracy tradeoff for multi-hour sessions
- GPU-backed: **`large-v3`** — near-perfect accuracy at acceptable GPU speed

### 5.3 Transcription Worker Docker Compose Fragment

```yaml
transcription-worker:
  build:
    context: apps/transcription-worker
    dockerfile: Dockerfile
  volumes:
    - recording-data:/data/recordings
    - transcript-data:/data/transcripts
    - whisper-models:/models/whisper
  environment:
    WHISPER_MODEL: small # or large-v3 for GPU
    WHISPER_COMPUTE_TYPE: int8 # int8 (CPU) or float16 (GPU)
    WHISPER_LANGUAGE: en # or auto for multilingual
    RECORDING_PATH: /data/recordings
    TRANSCRIPT_PATH: /data/transcripts
    REDIS_URL: redis://redis:6379
    QUEUE_URL: http://queues:3001
  # For GPU:
  # deploy:
  #   resources:
  #     reservations:
  #       devices:
  #         - driver: nvidia
  #           count: 1
  #           capabilities: [gpu]
  restart: unless-stopped
```

---

## 6. Provider Abstraction Implementation

The backend exposes a single `AiProvider` interface backed by Ollama (or a cloud provider). Both the summarization worker and the writing assistant relay endpoint use this same abstraction.

```ts
// packages/shared/ai/types.ts
interface AiProvider {
  complete(request: AiCompleteRequest): Promise<AiCompleteResponse>
  stream(request: AiCompleteRequest): AsyncIterable<string>
  isAvailable(): Promise<boolean>
  getModelInfo(modelName: string): Promise<AiModelInfo>
}

interface AiCompleteRequest {
  model: string // resolved from AI_SUMMARY_MODEL or AI_ASSISTANT_MODEL
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}
```

### 6.1 OllamaProvider Implementation

The `OllamaProvider` calls the Ollama `/api/chat` endpoint. The response format is OpenAI-compatible when using `/v1/chat/completions` (Ollama supports this since v0.1.24).

```ts
class OllamaProvider implements AiProvider {
  constructor(private baseUrl: string) {}

  async complete(request: AiCompleteRequest): Promise<AiCompleteResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model,
        messages: buildMessages(request),
        stream: false,
        options: { num_predict: request.maxTokens ?? 2048 },
      }),
    })
    // parse OpenAI-format response
  }

  async *stream(request: AiCompleteRequest): AsyncIterable<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...buildBody(request), stream: true }),
    })
    // yield token deltas from SSE stream
  }

  async isAvailable(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/api/tags`)
      return true
    } catch {
      return false
    }
  }
}
```

### 6.2 Cloud Provider Fallback

When `AI_CLOUD_PROVIDER` is set and the cloud enhancement is enabled for a campaign, the same interface is used with a `CloudProvider` implementation (OpenAI-compatible or Anthropic SDK). The summarization worker and relay endpoint select the provider based on the request context:

- Summarization: prefers cloud if enabled for campaign; falls back to local on failure
- Writing assistant: uses cloud only if user has given consent for this campaign; falls back to local

---

## 7. Model Management: Pull-on-Start

Models must be present before workers start. The recommended approach is a startup script that pulls required models if not already cached:

```sh
#!/bin/sh
# docker-entrypoint-ai.sh — runs before backend starts

ollama_url="${AI_PROVIDER_URL:-http://ollama:11434}"

pull_if_missing() {
  model="$1"
  if ! curl -sf "$ollama_url/api/show" -d "{\"name\":\"$model\"}" > /dev/null 2>&1; then
    echo "Pulling $model..."
    curl -sf "$ollama_url/api/pull" -d "{\"name\":\"$model\"}" | tail -1
  else
    echo "$model already present"
  fi
}

pull_if_missing "${AI_SUMMARY_MODEL}"
pull_if_missing "${AI_ASSISTANT_MODEL}"
```

This runs once at deploy time or when models change. Models are stored in the `ollama-models` volume and survive container restarts.

---

## 8. Admin UI: AI Provider Section

A seventh nav item — **AI** — is added to the admin left nav. See [ADMIN-UI-DESIGN.md](docs/ui/ADMIN-UI-DESIGN.md) §6 for the full layout spec.

### 8.1 Provider Status Card

At the top of the AI section: a read-only status card showing:

- Ollama reachability (green/red dot + URL)
- GPU detected: Yes / No (sourced from `GET /api/admin/ai/status`)
- VRAM available (when GPU detected)
- Summary model: name, status (Available / Downloading / Not found)
- Assistant model: name, status (Available / Downloading / Not found)
- Whisper model: name, status

### 8.2 Model Configuration

Two configuration cards: **Summary Model** and **Assistant Model**.

Each card contains:

| Control       | Type          | Description                                               |
| ------------- | ------------- | --------------------------------------------------------- |
| Model tag     | Text input    | Ollama model tag, e.g. `mistral:7b-instruct-q4_K_M`       |
| Pull model    | Button        | Triggers `POST /api/admin/ai/models/pull` with model name |
| Pull progress | Progress bar  | Live download progress via SSE or polling                 |
| Delete model  | Danger button | Removes model from Ollama; prompts confirmation           |
| Status badge  | Chip          | Available / Downloading / Not found / Error               |
| Model size    | Label         | Populated after pull                                      |

A separate card for **Transcription (Whisper)**:

| Control      | Type       | Description                             |
| ------------ | ---------- | --------------------------------------- |
| Model size   | Select     | tiny / base / small / medium / large-v3 |
| Compute type | Select     | int8 (CPU) / float16 (GPU) / float32    |
| Language     | Text input | Language code or `auto`                 |
| Status       | Badge      | Available / Not found                   |

### 8.3 Cloud AI Configuration

A collapsible card (collapsed by default):

| Control               | Type           | Description                                                               |
| --------------------- | -------------- | ------------------------------------------------------------------------- |
| Enable cloud AI       | Toggle         | Enables cloud as enhancement layer; off by default                        |
| Provider              | Select         | Anthropic / OpenAI / Custom                                               |
| API key               | Password input | Stored encrypted; never returned to frontend                              |
| Summary model         | Text input     | Cloud model for summarization (e.g. `claude-haiku-4-5-20251001`)          |
| Assistant model       | Text input     | Cloud model for writing assistant                                         |
| Test connection       | Button         | Sends a minimal test completion to verify credentials                     |
| Per-campaign override | Info text      | "Individual campaigns can opt out of cloud AI in their campaign settings" |

### 8.4 API Endpoints

```text
GET  /api/admin/ai/status           — provider health, GPU info, model statuses
POST /api/admin/ai/models/pull      — { model: string } — initiates pull
GET  /api/admin/ai/models/pull/:id  — pull progress SSE
DELETE /api/admin/ai/models/:name   — remove a model from Ollama
PUT  /api/admin/ai/config           — { summaryModel, assistantModel, whisperModel, ... }
GET  /api/admin/ai/config           — current config (API key masked)
POST /api/admin/ai/test             — { role: 'summary' | 'assistant' } — test completion
```

All endpoints require admin role. API key is write-only — `GET /api/admin/ai/config` returns `apiKey: "••••••••"`.

---

## 9. GPU Detection and Reporting

Ollama reports GPU availability via `GET /api/tags` and the model detail endpoint. The backend proxies this into the admin status response:

```ts
interface AiStatusResponse {
  ollamaReachable: boolean
  gpuDetected: boolean
  gpuName?: string // e.g. "NVIDIA GeForce RTX 4090"
  gpuVramMb?: number
  models: {
    summary: AiModelStatus
    assistant: AiModelStatus
    whisper: AiModelStatus
  }
  capabilityGateEnabled: boolean
}

interface AiModelStatus {
  name: string
  status: 'available' | 'not-found' | 'downloading' | 'error'
  sizeMb?: number
  quantization?: string
}
```

---

## 10. Related Documents

- [TRANSCRIPTION-RECORDING-SYSTEM.md](docs/architecture/TRANSCRIPTION-RECORDING-SYSTEM.md)
- [AI-WRITING-ASSISTANT.md](docs/ai/AI-WRITING-ASSISTANT.md)
- [AI-CONTEXT-SUMMARY-PROCESSING.md](docs/ai/AI-CONTEXT-SUMMARY-PROCESSING.md)
- [ADMIN-UI-DESIGN.md](docs/ui/ADMIN-UI-DESIGN.md)
- [PRIVACY-MODEL.md](docs/philosophy/PRIVACY-MODEL.md)
