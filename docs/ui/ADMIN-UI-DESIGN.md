# ADMIN UI DESIGN

_Minimalistic, full‑window, theme‑aware admin interface for VTT‑Chat._

---

## 1. Purpose & Philosophy

The Admin UI is a **separate SPA** used by a very small number of trusted operators.
Its goals are:

- **Operational clarity** — see system health, logs, and activity at a glance
- **Low cognitive load** — minimal UI, no clutter, no distractions
- **Fast navigation** — everything reachable in 1–2 clicks
- **Theme‑aware** — supports light & dark mode using the same token system
- **Modern & minimal** — clean typography, flat surfaces, subtle elevation
- **Functional first** — but still visually cohesive with the main app

This UI is not for players or DMs.
It’s for **administrators, developers, and support staff**.

---

## 2. Layout Structure (Full‑Window SPA)

The Admin UI uses a **two‑column layout**:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR (optional)                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ LEFT NAV      │ MAIN CONTENT AREA                                            │
│ (vertical)    │ (full-height, scrollable)                                    │
└───────────────┴──────────────────────────────────────────────────────────────┘
```

### **2.1 Left Navigation**

- Width: **240px**
- Background: `--bg-surface`
- Vertical list of sections
- Icons + labels
- Collapsible to **64px** icon‑only mode
- No nested menus (flat structure)

### **2.2 Main Content Area**

- Background: `--bg-app`
- Full height
- Scrollable
- Uses **card‑based sections** for clarity
- Responsive down to 1024px width

---

## 3. Theming (Light & Dark)

The Admin UI uses the **same token system** as the main app.

### **3.1 Dark Mode (default)**

- `--bg-app`: deep neutral
- `--bg-surface`: low‑contrast panels
- `--text-primary`: high‑contrast white
- `--border-subtle`: soft separators

### **3.2 Light Mode**

- `--bg-app`: soft grey
- `--bg-surface`: white
- `--text-primary`: near‑black
- `--border-subtle`: light grey

### **3.3 Component Behavior**

- No neon
- No gradients
- No heavy shadows
- Subtle elevation only (`box-shadow: 0 1px 2px rgba(0,0,0,0.08)` in light mode)
- Accent color used sparingly for:
  - Active nav item
  - Buttons
  - Status indicators

---

## 4. Navigation Structure

The Admin UI has **seven core sections**:

1. **Dashboard**
2. **Users**
3. **Groups & Campaigns**
4. **System Health**
5. **Logs & Activity**
6. **AI**
7. **Settings**

### **4.1 Navigation Example**

```text
Dashboard
Users
Groups & Campaigns
System Health
Logs & Activity
AI
Settings
```

Each item is:

- 40px height
- Icon + label
- Hover: `--accent-primary-soft`
- Active: left border `--accent-primary`

---

## 5. Section Specifications

Below are the **functional requirements** and **UI layout** for each section.

---

### **5.1 Dashboard**

A high‑level overview.

#### **Cards**

- Active Users
- Active Groups
- Recent Errors
- System Load
- Message Throughput
- Storage Usage

#### **Layout**

- 3‑column grid (auto‑wrap)
- Each card:
  - 200–300px wide
  - `--bg-surface`
  - Title + metric + sparkline

---

### **5.2 Users**

Admin‑level user management.

#### **Table Columns**

- Username
- Email
- Role (DM / Player / Admin)
- Last Active
- Status (Active / Suspended)
- Actions (View / Suspend / Delete)

#### **Actions**

- Search
- Filter by role
- View user details
- Force logout
- Reset MFA (if applicable)

#### **User Detail Panel**

- Profile info
- Groups joined
- Recent activity
- Flags / warnings

---

### **5.3 Groups & Campaigns**

Operational view of all groups.

#### **Table Columns**

- Group Name
- Campaign
- Player Count
- Environment
- Status (Active / Idle)
- Actions (View / Close / Move Players)

#### **Group Detail Panel**

- Players
- Environment
- Audio settings
- Notes count
- Chat volume
- Last activity

---

### **5.4 System Health**

Real‑time operational metrics.

#### **Cards**

- CPU
- Memory
- Disk
- Network
- LiveKit status
- Database status

#### **Charts**

- CPU load (line chart)
- Memory usage (area chart)
- Message throughput (bar or line)

#### **Status Indicators**

- Green = healthy
- Yellow = degraded
- Red = critical

---

### **5.5 Logs & Activity**

Centralized logging.

#### **Filters**

- Time range
- Severity (Info / Warn / Error)
- Source (API / LiveKit / DB / Frontend)
- User ID
- Group ID

#### **Log Table**

- Timestamp
- Severity
- Source
- Message
- Expandable details

---

### **5.6 AI**

AI provider configuration and model management. Only visible when `VTTCHAT_SUMMARY_PROCESSING_ENABLED=true` or an AI provider is configured. See [LOCAL-AI-PROVIDER.md](docs/ai/LOCAL-AI-PROVIDER.md) for full setup details.

#### **Provider Status Card** (read-only, top of section)

- Ollama reachability: green/red indicator + URL
- GPU detected: Yes / No
- GPU name and VRAM (when detected)
- Summary model status: Available / Downloading / Not found
- Assistant model status: Available / Downloading / Not found
- Whisper model status: Available / Not found

#### **Summary Model Card**

| Control | Description |
| ------- | ----------- |
| Model tag input | Ollama model tag, e.g. `mistral:7b-instruct-q4_K_M` |
| Pull model button | Downloads model to the Ollama volume |
| Pull progress bar | Live progress during download |
| Delete button | Removes model; requires confirmation |
| Status badge | Available / Downloading / Not found / Error |
| Model size label | Populated after pull |

#### **Assistant Model Card**

Same controls as Summary Model Card, targeting the real-time writing assistant model (e.g. `phi3.5:mini-instruct-q4_K_M`).

A note beneath the card explains the two-model split: "The assistant model prioritises fast first-token response (<3 s). Use a smaller, faster model here than the summary model."

#### **Transcription (Whisper) Card**

| Control | Description |
| ------- | ----------- |
| Model size select | tiny / base / small / medium / large-v3 |
| Compute type select | int8 (CPU) / float16 (GPU) / float32 |
| Language input | Language code or `auto` for auto-detection |
| Status badge | Available / Not found |

#### **Cloud AI Card** (collapsed by default)

| Control | Description |
| ------- | ----------- |
| Enable cloud AI toggle | Off by default; enables cloud as an enhancement layer |
| Provider select | Anthropic / OpenAI / Custom |
| API key input | Write-only; displayed as `••••••••` after save |
| Summary model input | Cloud model name for post-session summarization |
| Assistant model input | Cloud model name for writing assistant |
| Test connection button | Sends a minimal test completion to verify credentials |
| Info text | "Individual campaigns can opt out of cloud AI in their campaign settings." |

When cloud AI is disabled: card shows a single greyed toggle with explanatory text. No API key input is visible.

#### **Layout**

Cards stack vertically in the main content area. Provider Status Card is always first. Cloud AI Card is always last and collapsed unless the operator expands it.

---

### **5.7 Settings**

Admin‑level configuration.

#### **Sections**

- System configuration
- Feature flags
- Maintenance mode
- API keys
- Storage settings
- Backup & restore

#### **UI**

- Form‑based
- Minimal
- Clear labels
- Save button uses `--accent-primary`

---

## 7. Interaction & Motion

The Admin UI is **minimal**, so motion is subtle.

### **Allowed**

- Fade‑in for cards
- Slide‑in for detail panels
- Hover states
- Button press scale (0.98 → 1.0)

### **Not used**

- Pulsing
- Glows
- Complex transitions

---

## 8. Component Library (Admin‑Specific)

### **Admin Card**

- 200–300px
- Title (14px)
- Metric (24px bold)
- Optional sparkline

### **Admin Table**

- Dense rows (36px height)
- Sticky header
- Sortable columns

### **Detail Panel**

- Right‑side slide‑in
- 360px width
- `--bg-elevated`

### **Form Controls**

- Minimal inputs
- Subtle borders
- Clear labels
- No heavy shadows

---

## 9. Typography

### **Font**

- Same as main app (Inter / system UI font)

### **Sizes**

- H1: 20px
- H2: 16px
- Body: 14px
- Labels: 12px

### **Weight**

- Titles: semibold
- Body: regular

---

## 10. Summary

The Admin UI is:

- **Minimalistic**
- **Functional**
- **Theme‑aware**
- **Full‑window**
- **Modern**
- **Consistent with your main app**
- **Lightweight but not neglected**

It gives administrators everything they need without unnecessary visual noise.
