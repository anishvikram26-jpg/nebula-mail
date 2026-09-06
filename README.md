# Nebula Mail — AI-Powered Mail Web Application

Nebula Mail is a modern, responsive email client integrated with Gmail API, PostgreSQL via Prisma, Google OAuth 2.0, an action-oriented AI Assistant copilot, and **real-time push synchronization powered by Google Cloud Pub/Sub**.

---

## Real-Time Gmail Synchronization Architecture (Phase 9)

```
                              ┌───────────────────────────────────┐
                              │           Google Cloud            │
                              │                                   │
                              │  User Mailbox Activity (Gmail)    │
                              │               │                   │
                              │               ▼                   │
                              │       Gmail users.watch()         │
                              │               │                   │
                              │               ▼                   │
                              │     Cloud Pub/Sub Topic           │
                              └───────────────┬───────────────────┘
                                              │
                                              │ HTTP POST Push (OIDC / Token Auth)
                                              ▼
                             ┌─────────────────────────────────────┐
                             │    POST /api/webhooks/gmail         │
                             │                                     │
                             │  1. Authenticate (OIDC / Secret)    │
                             │  2. Base64 decode Pub/Sub data      │
                             │  3. Resolve local User by email     │
                             │  4. Run Incremental History Sync    │
                             │     - users.history.list()          │
                             │     - messagesAdded (upsert)        │
                             │     - messagesDeleted (remove)      │
                             │     - labelsAdded / labelsRemoved   │
                             │     - Expired history fallback      │
                             │  5. Update SyncState & return 200   │
                             └─────────────────┬───────────────────┘
                                               │
                                               │ Updates PostgreSQL (Prisma)
                                               ▼
                             ┌─────────────────────────────────────┐
                             │       PostgreSQL Database           │
                             │   (emails, threads, sync_states)    │
                             └─────────────────▲───────────────────┘
                                               │
                                               │ Silent Background Revalidation
                                               │ (every 45s & on tab visibility)
                                               │
                             ┌─────────────────┴───────────────────┐
                             │         Nebula Mail Client          │
                             │                                     │
                             │  - Headless <RealtimeListener />    │
                             │  - Zustand Mail Store               │
                             │  - In-place MailList revalidation   │
                             │  - Preserves compose draft,         │
                             │    selected email, and AI state     │
                             └─────────────────────────────────────┘
```

---

## Key Components

### 1. Gmail Watch Service (`lib/gmail/watch.ts`)
- Calls `gmail.users.watch()` for the authenticated user, directing notifications to `GMAIL_PUBSUB_TOPIC`.
- Stores `watchExpiration` and initial `historyId` in the `SyncState` database table.
- **Smart Renewal**: Skips renewal if the current watch has more than 24 hours of validity remaining, avoiding unnecessary Google API quota usage. Supports `force: true` for forced renewals.

### 2. Gmail History API & Incremental Sync (`lib/gmail/history.ts`)
- Initiated by Pub/Sub push notifications.
- Queries `gmail.users.history.list()` starting from `SyncState.historyId`.
- **`messagesAdded`**: Fetches full MIME message, parses headers/body/attachments, and idempotently upserts `Thread` and `Email` records.
- **`messagesDeleted`**: Removes the local `Email` and recalculates thread counts and read/starred status.
- **`labelsAdded` / `labelsRemoved`**: Updates `UNREAD`, `STARRED`, and user labels in real-time.
- **Expired History Fallback**: If Gmail returns HTTP 404 (`HistoryId is too old`), the service automatically recovers by triggering a full sync (`syncUserMailbox`), safely re-establishing a valid history baseline without breaking mailbox state.

### 3. Pub/Sub Push Webhook (`POST /api/webhooks/gmail`)
- Receives HTTP POST push notifications directly from Google Cloud Pub/Sub.
- Does not rely on browser session cookies.
- **Security & Authentication**:
  - **OIDC Token Verification (Production Standard)**: Validates the Google-issued OpenID Connect JWT in the `Authorization: Bearer <token>` header against Google's public certificates. Checks token issuer (`https://accounts.google.com`), audience (`PUBSUB_VERIFICATION_AUDIENCE`), and authorized service account email (`PUBSUB_SERVICE_ACCOUNT_EMAIL`).
  - **Verification Secret Token (Defense-in-Depth / Local Dev)**: Supports shared secret token verification via `?token=` query parameter or `x-goog-pubsub-token` header against `GOOGLE_PUBSUB_VERIFICATION_TOKEN`.
- **User Resolution**: Strictly resolves the database user from the verified `emailAddress` in the decrypted payload. Never trusts client-supplied user IDs.
- **Safe Delivery Acknowledgment**: Returns HTTP 200 for recognized and unrecognized email addresses to prevent Google Pub/Sub from entering an infinite retry loop.

### 4. Watch Management API (`POST /api/mail/watch`)
- Authenticated endpoint (requires user session).
- Automatically called by the frontend upon login to ensure active watch coverage.
- Returns sanitized status (`{ success, expiration, historyId }`); never exposes OAuth access or refresh tokens.

### 5. Frontend Real-Time Revalidation (`components/mail/realtime-listener.tsx`)
- Headless coordinator mounted within the application shell.
- Periodically triggers background revalidation of the mail list (45-second interval).
- **Visibility Aware**: Pauses polling when the tab is hidden to conserve bandwidth and CPU. Immediately triggers an update when the user switches back to the tab.
- **Non-Destructive**: Never disrupts user work — preserves open compose drafts, selected emails, and AI copilot state.

---

## Environment Configuration

Configure the following variables in your `.env.local` (see `.env.example` for template):

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nebula_mail?schema=public"

# Google OAuth 2.0
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"

# OpenAI
OPENAI_API_KEY="sk-proj-..."

# Session Security
SESSION_SECRET="your-32-byte-secure-random-session-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Real-Time Pub/Sub Webhook
GMAIL_PUBSUB_TOPIC="projects/your-gcp-project-id/topics/gmail-push-notifications"

# Webhook Security — OIDC Service Account Authentication (Production)
PUBSUB_SERVICE_ACCOUNT_EMAIL="pubsub-invoker@your-gcp-project-id.iam.gserviceaccount.com"
PUBSUB_VERIFICATION_AUDIENCE="https://your-domain.com/api/webhooks/gmail"

# Optional Verification Token (Local development / Defense-in-depth)
GOOGLE_PUBSUB_VERIFICATION_TOKEN="your-custom-webhook-secret-token"
```

---

## Google Cloud Pub/Sub Setup Guide

To receive push notifications from Gmail in staging or production:

1. **Enable the Gmail API and Cloud Pub/Sub API** in your Google Cloud Project.
2. **Create a Pub/Sub Topic**:
   ```bash
   gcloud pubsub topics create gmail-push-notifications
   ```
3. **Grant Publish Permissions to Gmail**:
   Gmail sends notifications using the service account `gmail-api-push@system.gserviceaccount.com`. Grant it the `Pub/Sub Publisher` role on your topic:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-push-notifications \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
4. **Create a Pub/Sub Push Subscription**:
   Configure a push subscription pointing to your public webhook URL (`https://your-domain.com/api/webhooks/gmail`):
   ```bash
   # Create with OIDC service account authentication enabled:
   gcloud pubsub subscriptions create gmail-push-subscription \
     --topic=gmail-push-notifications \
     --push-endpoint="https://your-domain.com/api/webhooks/gmail" \
     --push-auth-service-account="pubsub-invoker@your-gcp-project-id.iam.gserviceaccount.com"
   ```
5. **Local Development with Webhooks**:
   Because Google Cloud Pub/Sub requires a publicly accessible HTTPS endpoint, use a tunneling tool like [ngrok](https://ngrok.com) or [Cloudflare Tunnels] during local development:
   ```bash
   ngrok http 3000
   # Update the push subscription endpoint to: https://<ngrok-subdomain>.ngrok-free.app/api/webhooks/gmail?token=your-custom-webhook-secret-token
   ```

---

## Verification & Testing

Run the automated test suite:

```bash
# Run all tests (105 tests across 12 test suites)
npm test

# Run only real-time sync tests
npx vitest run tests/realtime.test.ts

# Run linter
npm run lint

# Run TypeScript typecheck
npx tsc --noEmit

# Test production build
npm run build
```

---

## Known Tradeoffs & Limitations

1. **Gmail Watch Expiration**:
   Gmail `users.watch()` subscriptions expire after at most 7 days. The application automatically renews the watch on login and checks expiration when users access the mail client. For long-dormant accounts that do not log in within 7 days, notifications pause until the next visit.
2. **Push Latency & Local Polling**:
   Google Cloud Pub/Sub push delivery is near-instantaneous (typically 1–3 seconds). The frontend incorporates a non-intrusive 45-second revalidation interval and visibility change triggers as a resilient fallback in case of transient webhook delivery delays.
3. **Label Support**:
   The default watch configuration monitors the `INBOX` label. Changes made outside of monitored labels (such as drafts edited directly in Gmail web) are synchronized during manual refresh or full sync.
