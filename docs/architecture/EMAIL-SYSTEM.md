# Email System

Status: Planned (W-Email-Templates, Phase 4). Email worker is live; templates and user preferences are not yet implemented.

See `docs/operations/QUEUES.md` for SMTP configuration and the email job flow.

---

## 1. Why This Exists

VTT-Chat needs to reach players and DMs when they are not connected. Auth emails (verification, password reset) are table-stakes for any account system. Beyond that, the platform generates natural notification moments — campaign invites, join-request decisions, shared handouts, session reminders, and AI-generated session summaries — that should reach people without requiring them to keep a browser tab open.

The email system is intentionally minimal: ten template types, one category opt-out model, and zero marketing email. Every email has a clear reason to exist and a clear action the recipient can take.

---

## 2. Architecture

```text
┌──────────────────────────────────────────────────┐
│ apps/backend                                      │
│                                                   │
│  Route or service event:                          │
│    POST /api/auth/register           (verify)     │
│    POST /api/auth/forgot-password    (reset)      │
│    POST /api/campaigns/:id/invite    (join)       │
│    POST /api/campaigns/:id/invite-watch (watch)  │
│    CAMPAIGN:JOIN_REQUEST_RECEIVED    (DM alert)  │
│    CAMPAIGN:JOIN_REQUEST_RESOLVED    (player)    │
│    NOTES:HANDOUT_SURFACED + offline  (handout)   │
│    POST /api/internal/session-reminder (sched.)  │
│    generate-summary job complete     (summary)   │
│    Weekly digest cron job            (digest)    │
│                                                   │
│  EmailGate (check UserEmailPreferences)           │
│    └─ auth emails: always enqueue                │
│    └─ campaign emails: check campaignEmails      │
│    └─ session emails: check sessionEmails        │
│    └─ offline emails: check offlineEmails        │
│                                                   │
│  POST http://queues:3001/queues/email/enqueue     │
└──────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│ apps/queues — vttchat:email queue                 │
│                                                   │
│  email.worker                                     │
│    ├─ renderTemplate(templateId, variables)       │
│    │    React Email → HTML + plain-text           │
│    └─ nodemailer.sendMail()                       │
│         SMTP_SERVICE (Gmail, Outlook365, ...)     │
│         or manual SMTP_HOST                       │
└──────────────────────────────────────────────────┘
```

The backend is the producer. It checks user preferences before enqueuing — offline users never receive emails they have opted out of. The queues service is the consumer: it renders the template and delivers via SMTP. No email-specific state lives outside the queue.

---

## 3. Template Engine

All templates are built with **React Email** (`@react-email/components`). JSX components render to email-safe HTML (inline styles, table-based layout, no flexbox/grid) and a plain-text fallback. Every template extends `BaseEmailTemplate`.

### BaseEmailTemplate

Shared wrapper providing:

- VTT-Chat logo (inline base64 or hosted asset URL from env `APP_URL`)
- Consistent header, footer, and typography using the app's design tokens approximated in email-safe values (no CSS variables — values are hardcoded in the component)
- "Manage email preferences" footer link to `/settings/email-preferences` (only rendered for non-auth emails)
- One-click unsubscribe link for non-auth emails (signed token, see §8)
- Responsive single-column layout, dark-mode safe (`prefers-color-scheme` media query in `<head>`)

### Template file locations

```
apps/queues/src/email/templates/
  base/
    BaseEmailTemplate.tsx      # shared wrapper
    EmailButton.tsx            # CTA button component
    EmailDivider.tsx           # horizontal rule
    EmailMarkdown.tsx          # DMDX-style markdown block
  auth/
    EmailVerification.tsx
    PasswordReset.tsx
  campaign/
    CampaignJoinInvite.tsx
    CampaignWatchInvite.tsx
    JoinRequestReceived.tsx
    JoinRequestResolved.tsx
  session/
    SessionReminder.tsx
    SessionSummaryReady.tsx
  offline/
    SharedHandout.tsx
    WeeklyCampaignDigest.tsx
  index.ts                     # templateId → component map
```

### Dev preview

React Email ships a built-in preview server. Run from `apps/queues/`:

```bash
npm run email:dev
# opens http://localhost:3003 with live-reload preview of all templates
```

`package.json` script: `"email:dev": "email dev --dir src/email/templates"`

---

## 4. Email Types Reference

### Auth emails (no opt-out)

#### Email Verification

- **Trigger**: `POST /api/auth/register` (full account creation with email/password)
- **Recipient**: the new user
- **Template**: `email-verification`
- **Variables**: `toName`, `verifyUrl` (`/api/auth/verify-email?token=…`)
- **Behaviour**: unverified accounts show a dismissible banner until verified; the banner links to "resend verification" (`POST /api/auth/resend-verification`)
- **Token TTL**: 24 hours; expired token prompts resend

#### Password Reset

- **Trigger**: `POST /api/auth/forgot-password`
- **Recipient**: the requesting user (looked up by email; silent if not found)
- **Template**: `password-reset`
- **Variables**: `toName`, `resetUrl` (`/auth/reset-password?token=…`)
- **Token TTL**: 1 hour; single-use

---

### Campaign emails (opt-out: `campaignEmails`)

#### Campaign Join Invite

- **Trigger**: DM shares an invite link or explicitly invites a user by email from the lobby
- **Recipient**: the invited user
- **Template**: `campaign-join-invite`
- **Variables**: `toName`, `campaignName`, `dmName`, `joinUrl` (`/join/:code`)
- **Note**: only sent to users with a full account and a verified email; guest users join via the link directly

#### Campaign Watch Invite

- **Trigger**: DM shares a spectator invite link or explicitly invites by email
- **Recipient**: the invited spectator
- **Template**: `campaign-watch-invite`
- **Variables**: `toName`, `campaignName`, `dmName`, `watchUrl` (`/watch/:code`)

#### Join Request Received (DM)

- **Trigger**: `CAMPAIGN:JOIN_REQUEST_RECEIVED` WS event — a non-member requests to join
- **Recipient**: the campaign DM
- **Template**: `join-request-received`
- **Variables**: `toName` (DM), `requesterName`, `requesterMessage`, `campaignName`, `reviewUrl` (deep-links to lobby join-request panel)
- **Deduplication**: at most one email per requester per campaign per 24 hours (tracked in Redis)

#### Join Request Resolved (Player)

- **Trigger**: DM approves or rejects a join request
- **Recipient**: the requesting player
- **Template**: `join-request-resolved`
- **Variables**: `toName`, `campaignName`, `approved` (boolean), `dmMessage` (optional), `joinUrl` (if approved)

---

### Session emails (opt-out: `sessionEmails`)

#### Session Reminder

- **Trigger**: a BullMQ `delayed` job scheduled when `Session.scheduledAt` is set; fires `SESSION_REMINDER_HOURS_BEFORE` hours before the session (default: 1)
- **Recipient**: all campaign members with `sessionEmails: true`
- **Template**: `session-reminder`
- **Variables**: `toName`, `campaignName`, `sessionName`, `startsAt` (ISO string), `launchUrl`
- **Prerequisite**: requires `scheduledAt: DateTime?` field on the `Session` Prisma model; DM sets this in session or campaign settings

#### Session Summary Ready

- **Trigger**: `generate-summary` job completes successfully (only when `LLM_SUMMARY_URL` is set)
- **Recipient**: all campaign members with `sessionEmails: true`
- **Template**: `session-summary-ready`
- **Variables**: `toName`, `campaignName`, `sessionName`, `excerpt` (first ~200 chars of summary), `journalUrl` (pop-out journal URL)

---

### Offline notification emails (opt-out: `offlineEmails`)

#### Shared Handout

- **Trigger**: `POST /api/notes/:noteId/surface` (DM shares a note) AND the recipient is not currently connected (checked via Redis presence: `presence:{sessionId}:{userId}`)
- **Recipient**: each offline recipient of the shared note
- **Template**: `shared-handout`
- **Variables**: `toName`, `campaignName`, `dmName`, `noteTitle`, `noteExcerpt`, `notesUrl` (deep-links to the Notes tab)
- **Deduplication**: if the user reconnects and receives the `NOTES:HANDOUT_SURFACED` WS event within 5 minutes of the email being sent, no duplicate UI treatment is needed — both the email and the WS card are independent delivery paths

#### Weekly Campaign Digest

- **Trigger**: BullMQ repeatable job (`QUEUE_DIGEST_CRON`, default `0 9 * * 1` — Monday 09:00 UTC)
- **Recipient**: members of any active campaign with `offlineEmails: true` who have not been connected in the last 7 days
- **Template**: `weekly-campaign-digest`
- **Variables**: `toName`, campaigns array, each with:
  - `campaignName`, `dmName`
  - `recentSessions`: last 1–3 sessions with name and date
  - `upcomingSession`: next `scheduledAt` if set
  - `newNoteCount`: number of notes shared since the user's last connection
  - `launchUrl`
- **Note**: a user belonging to 3 campaigns receives one email listing all three — not three separate emails

---

## 5. User Email Preferences

### Data model

```prisma
model UserEmailPreferences {
  userId         String  @id
  user           User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  campaignEmails Boolean @default(true)
  sessionEmails  Boolean @default(true)
  offlineEmails  Boolean @default(true)
  // auth emails (emailVerification, passwordReset) are always sent — no field needed
}
```

Created with defaults on first request to `GET /api/profile/email-preferences` (upsert on read).

### API

```
GET  /api/profile/email-preferences
     → { campaignEmails, sessionEmails, offlineEmails }

PUT  /api/profile/email-preferences
     body: { campaignEmails?, sessionEmails?, offlineEmails? }
     → 200 with updated prefs
```

Both endpoints require a valid JWT (`requireAuth` middleware). Response is the full `UserEmailPreferences` record.

### UI surface

The three toggles are exposed in the user settings panel (right-rail SETTINGS → user section):

```
Email notifications
  [✓] Campaign invites and join requests
  [✓] Session reminders and summaries
  [✓] Offline handouts and weekly digest
```

Auth emails are shown as always-on and greyed out with a "required" label.

### EmailGate (backend utility)

Before enqueuing any non-auth email, call `EmailGate.canSend(userId, category)`:

```ts
// apps/backend/src/services/email/email-gate.ts
type EmailCategory = 'campaign' | 'session' | 'offline'

async function canSend(userId: string, category: EmailCategory): Promise<boolean>
```

`canSend` reads `UserEmailPreferences` and returns `false` if the relevant category is disabled. Returns `true` when no preferences record exists (defaults on first use).

---

## 6. Unsubscribe Mechanism

Every non-auth email footer includes a one-click unsubscribe link:

```
/api/profile/email-preferences/unsubscribe?token=<signed>
```

The signed token encodes `{ userId, category, issuedAt }` using `INTERNAL_JOB_SECRET` as the HMAC key. Clicking the link:

1. Backend validates the HMAC
2. Sets the relevant category to `false` in `UserEmailPreferences`
3. Redirects to `/settings/email-preferences` with a `?unsubscribed=<category>` query param
4. Frontend shows a toast: "Email notifications for [category] turned off. You can re-enable them in Settings."

Token TTL: 30 days. Expired tokens redirect to `/settings/email-preferences` with a `?resubscribe=true` prompt.

---

## 7. Sending Flow (Step by Step)

Using "Shared Handout" as a representative non-auth example:

1. DM calls `POST /api/notes/:noteId/surface`
2. Backend persists the note visibility change and broadcasts `NOTES:HANDOUT_SURFACED` to online recipients via WS
3. For each recipient, backend checks Redis presence key `presence:{sessionId}:{userId}`:
   - User **online** → WS delivery only; no email
   - User **offline** → proceed
4. `EmailGate.canSend(userId, 'offline')` → false? skip. true? proceed
5. Backend calls `POST http://queues:3001/queues/email/enqueue` with:
   ```json
   {
     "type": "send-email",
     "payload": {
       "to": "player@example.com",
       "subject": "[VTT-Chat] DM shared a handout: Dragon Map",
       "templateId": "shared-handout",
       "variables": { "toName": "Aria", "campaignName": "...", ... },
       "correlationId": "note-surface:abc123"
     }
   }
   ```
6. BullMQ enqueues the job to `vttchat:email`
7. `email.worker` picks up the job:
   - Calls `renderTemplate('shared-handout', variables)` → `{ html, text }`
   - Calls `nodemailer.sendMail({ from, to, subject, text, html })`
8. On SMTP failure: BullMQ retries with exponential backoff (up to `QUEUE_MAX_ATTEMPTS`)
9. On terminal failure: job promoted to `vttchat:dlq`

---

## 8. Session Reminder Scheduling

Session reminders require `Session.scheduledAt` to be set. The scheduling flow:

1. DM sets `scheduledAt` via campaign settings or a session editor field
2. Backend calculates `fireAt = scheduledAt - SESSION_REMINDER_HOURS_BEFORE * 3600000`
3. If `fireAt` is in the future, backend enqueues a BullMQ **delayed** job to `vttchat:session-lifecycle`:
   ```ts
   queue.add('session-reminder', { sessionId }, { delay: fireAt - Date.now() })
   ```
4. If `scheduledAt` is updated or the session is cancelled, the prior delayed job is removed by jobId and a new one enqueued
5. When the job fires, the worker fetches all members from the backend, filters by prefs, and enqueues one `send-email` job per eligible member

Env var: `SESSION_REMINDER_HOURS_BEFORE` (default: `1`)

---

## 9. Weekly Digest Scheduling

The digest worker runs as a BullMQ repeatable job:

```ts
queue.upsertJobScheduler('weekly-digest', { pattern: config.scheduler.digestCronExpression })
```

Env var: `QUEUE_DIGEST_CRON` (default: `0 9 * * 1` — Monday 09:00 UTC)

On each fire:

1. Worker calls `GET /api/internal/jobs/digest-eligible-users` (internal, secured by `INTERNAL_JOB_SECRET`)
2. Backend queries users who:
   - Have `offlineEmails: true`
   - Are members of at least one non-archived campaign
   - Have not connected in the last 7 days (`User.lastSeenAt < now - 7d`)
3. For each user, backend returns campaign summaries (recent sessions, upcoming, new note counts)
4. Worker enqueues one `send-email` job per user with `templateId: 'weekly-campaign-digest'`

---

## 10. Markdown in Emails

Shared handout and session summary emails may contain DMDX-flavoured markdown from notes or journal entries. The `EmailMarkdown` component in the base template handles a safe subset:

| Markdown element | Email rendering                                                           |
| ---------------- | ------------------------------------------------------------------------- |
| `**bold**`       | `<strong>`                                                                |
| `_italic_`       | `<em>`                                                                    |
| `# Heading`      | Inline bold, larger font-size (no `<h1>` — poor email support)            |
| `- list item`    | `•` bullet with table layout                                              |
| `` `code` ``     | Monospace span, background tint                                           |
| `[text](url)`    | `<a>` with `APP_URL`-origin check (external links rendered as plain text) |
| DMDX block tags  | Stripped — rendered as their plain-text fallback only                     |

Images from note attachments are not embedded — the email links to the note in the app instead.

---

## 11. Adding a New Email Type

1. Add `templateId` constant to `packages/shared/jobs/types.ts` (`SendEmailPayload.templateId` union)
2. Create `apps/queues/src/email/templates/<category>/<TemplateName>.tsx` extending `BaseEmailTemplate`
3. Register in `apps/queues/src/email/templates/index.ts` (templateId → component map)
4. Identify the trigger in the backend (route, WS event, or cron job)
5. Add `EmailGate.canSend` check if non-auth; determine the category
6. Call `enqueueEmail(userId, { templateId, variables, subject, to })` from the backend service
7. Add a preview entry to the React Email dev server (automatic — all templates in `templates/` are discovered)
8. Update this document's §4 table

---

## 12. Related Documents

- [docs/operations/QUEUES.md](../operations/QUEUES.md) — SMTP config, job flow, troubleshooting
- [docs/architecture/QUEUE-JOB-MANAGER.md](QUEUE-JOB-MANAGER.md) — queue infrastructure
- [docs/architecture/SESSION-LIFECYCLE.md](SESSION-LIFECYCLE.md) — session states referenced by reminder logic
- [ROADMAP.md](../../ROADMAP.md) — W-Email-Templates item (Phase 4)
