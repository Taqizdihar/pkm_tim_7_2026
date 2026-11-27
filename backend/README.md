# Dewi Sri API and internal CMS

Express 5 + TypeScript extends the existing MySQL database. Authentication uses Argon2id and database sessions; writes use validated parameterized SQL and transactions. Member profiles, cultivations, care, schedules, points and conversations are persisted in MySQL. Only ordinary members can use the member application; administrators retain their separate CLI and CMS authentication.

## First-time setup (Windows PowerShell)

1. Start MySQL in Laragon. Keep the existing `dewi_sri` database and records.
2. In phpMyAdmin choose `dewi_sri`, open **SQL**, paste the contents of `docs/database/03_admin_sessions.sql`, and click **Go**. This adds **one supplementary table** to the original 19. The application never executes this script. Do not rerun the original schema or seed.
3. Open a terminal at the repository root:

   ```powershell
   cd backend
   npm install
   # Only if backend/.env does not already exist:
   Copy-Item .env.example .env
   ```

   Configure the existing `.env` with actual MySQL credentials. Keep `FRONTEND_ORIGIN=http://localhost:3000`. `HOST=127.0.0.1`, `PORT=3001`, `SESSION_HOURS=8`, and `UPLOAD_DIR=storage/uploads` are local defaults. An empty password is accepted only when explicitly configured. `.env` stays outside Git.
4. Provision your administrator interactively:

   ```powershell
   npm run admin:create
   npm run admin:list
   ```

   Enter a name, email, and password twice. Password input is masked. Use 6–128 characters; uppercase letters, lowercase letters, digits, and symbols are optional. This policy also applies to password resets. Credentials are never passed as command arguments. Duplicate emails are rejected without changing existing roles. Creation discovers the `admin` role by code and inserts the user and role atomically. `email_verified_at` remains NULL: this is internal developer provisioning, not email verification.
5. Start the API:

   ```powershell
   npm run dev
   ```

6. In another terminal at the repository root:

   ```powershell
   npm install
   npm run dev
   ```

7. Open **http://localhost:3000/admin/login**. Use this exact origin for the CMS so the Vite proxy handles cookies and CSRF. Log in with your CLI-created account. Open **http://127.0.0.1:3001/api/v1/health/database** to verify MySQL access.

## CLI account maintenance

Run these from `backend/`:

```powershell
npm run admin:create
npm run admin:list
npm run admin:reset-password
npm run admin:disable
```

Reset asks for email and a new masked password twice and revokes existing sessions in the same transaction. Disable asks for confirmation, changes status, and revokes sessions. Only administrator accounts are eligible. The last active administrator cannot be disabled; create an active replacement first. If you lose the last password, use `admin:reset-password`. A missing session table causes reset/disable to roll back; complete step 2 first. List shows only name, email, status, and creation time. CLI changes are audited without claiming an authenticated browser actor.

## CMS workflow

- `/admin`: database statistics and recent species.
- `/admin/pets`: search/filter species, create/edit drafts, illustrations, up to three actions with safe local indicator effects, publication and archive.
- `/admin/categories`: parent relationships, habitat, display order, activation. Root categories require a habitat. Cycles are rejected and inactive ancestors hide their descendants from the public catalog.
- `/admin/care-actions`: reusable labels, icons, descriptions and activation.
- `/admin/guides`: plain text content, type, species, order, draft/publication/archive. React renders content as text, never unsanitized HTML.
- `/admin/settings`: allowlisted `app_name` and `welcome_message` storage, plus safe AI diagnostics and an explicit connection test. Provider configuration stays in the server environment. The future RAG adapter and live weather remain unavailable.

To add **Ayam Jantan**, create a draft with slug `ayam-jantan`, select **Ayam** (Kandang), and save. Upload a `normal` illustration, optionally `sick` or custom states, then assign care actions and save them. Set status to **Terbit** and save. Open or focus the public app at `http://localhost:3000/?screen=beranda`, choose **Ayam**, and select the new species. Published guides also appear in the species guide dialog. Archive removes a species from new selection while keeping database relationships and local history.

Archive species/guides and deactivate categories/actions instead of deleting them. Member cultivation ownership uses species IDs; the frontend resolves current catalog slugs. Accounts are disabled rather than deleted. Members may delete their own conversations; deleted conversations no longer authorize access to their photos.

## Closed KWT membership

The complete database inventory is 21 tables: the 19 base tables, `admin_sessions` (03), and `member_sessions` (04). Before starting member features, check `GET /api/v1/health/member-schema`. Missing columns or session tables return `503 SCHEMA_NOT_READY`; this does not stop the admin catalog. Connection failure returns `503 DATABASE_UNAVAILABLE`.

If the extension is missing, manually open **phpMyAdmin → dewi_sri → SQL → Paste SQL → Go**, using `docs/database/04_member_auth.sql`. The ALTER section is a one-time change. Do not rerun it when applied, and do not rerun base schema/seed. No startup command runs migrations. Existing admin passwords and sessions are preserved, including their existing timezone behavior.

Configure `MEMBER_SESSION_HOURS=24` independently of admin `SESSION_HOURS=8`. Member session instants are explicitly written and compared in UTC in SQL. Daily rewards and schedule occurrences use the server's Asia/Jakarta date. Member cookie `dewi_member` has Path `/api/v1`, HttpOnly, SameSite=Lax and Secure under production HTTPS. Admin cookie `dewi_admin` retains Path `/api/v1/admin`. Tokens are opaque 256-bit random values; only SHA-256 digests are persisted. CSRF stays in frontend memory and is reacquired with `/auth/me`. Every mutation requires the configured Origin and CSRF token. Login is limited to 10 attempts per 15 minutes per IP. Unknown, disabled, privileged and expired-credential accounts receive a generic denial with password verification/dummy verification.

Create accounts in `/admin/members`, with name and at least one identifier. New accounts are always active; the create form has no status selector and the API rejects a disabled status on creation. Existing accounts can still be disabled/reactivated. Phone is recommended: `0812…`, kept as a string, optionally normalized from pasted `+62`/`62`, spaces or hyphens. Usernames are lowercase, start with a letter, and use letters, digits, period, underscore or hyphen (3–50 characters). Email is optional and normalized. Database unique keys handle concurrent duplicates. Role assignment always resolves `member` by code; users with any additional role cannot be managed here.

Member credentials use the existing Argon2id utility. Member passwords accept 6–200 characters, including spaces, without trimming, truncation or composition rules. The minimum matches the admin CLI; the admin CLI policy remains unchanged. Initial/reset passwords default to requiring a change. Temporary expiry is disabled for newly provisioned credentials (`NULL`); externally assigned expiry is honored by login. No public registration or automated recovery provider exists. For lost passwords, the admin uses **Atur Ulang Kata Sandi**, confirms the new credential and communicates it privately. No old password is required. Updates, session revocation and sanitized audit entries are transactional. Login, password change, reset and member writes synchronize on the user row, with session checks repeated inside mutations. Member-initiated change requires the current password and rotates every session and CSRF token.

## Member endpoints

All responses retain `{ success, data }` / `{ success: false, error: { code, message } }`. Member mutations reject unknown keys and derive identity exclusively from the cookie session. No roles, account IDs, resulting metrics, points or assistant messages are accepted from clients.

| Context | Endpoints |
| --- | --- |
| Member auth | `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/change-password` |
| Admin member management | `GET/POST /api/v1/admin/members`, `GET/PATCH /:id`, `POST /:id/reset-password`, `PATCH /:id/status` |
| Bootstrap | `GET /api/v1/member/bootstrap` |
| Profile | `GET/PATCH /api/v1/member/profile`, `POST /profile/avatar` (multipart `image`) |
| Preferences | `GET/PATCH /api/v1/member/preferences` |
| Cultivation | `GET/POST /api/v1/member/cultivations` (`{slug}` selects/reuses), `PATCH /cultivations/:id` (nickname) |
| Care | `POST /api/v1/member/cultivations/:id/care-actions` (`{slot,client_event_id}` UUID) |
| Schedules | `GET/POST /api/v1/member/schedules`, `PATCH /schedules/:id`, `POST /schedules/:id/complete` (`{client_event_id}`) |
| Journal/progress/reward | `GET /api/v1/member/journal`, `GET /progress`, `POST /rewards/daily` (empty object) |
| Conversations | `GET/POST /api/v1/member/chat/conversations`, `GET/PATCH/DELETE /chat/conversations/:id`, `POST /chat/conversations/:id/messages` (`{content,media_id?,species?,intent?,client_request_id}`) |
| Private media | `POST /api/v1/member/chat/media` (multipart `image`), `GET /api/v1/member/media/:filename` |

Admin member lists accept `search`, `status` and `page` (20 per page). Conversation lists are 20 per page, messages are 100 per page, journal entries are 500 per page; those endpoints accept a bounded `offset`. Bootstrap excludes chat messages and photo bytes. CMS list rows never contain private consultation data or password hashes. Restricted sessions only allow `/auth/me`, `/auth/change-password` and `/auth/logout`.

Cultivation writes reuse the existing `user_cultivations` under the member row lock. Care effects come from active CMS action associations, are clamped to 0–100 and atomically create `care_logs`. A repeated `client_event_id` cannot apply effects twice; schedule completion also checks the scheduled date. Rank uses care count thresholds 3, 6, 10 and 20; daily reward grants 5 points once per server date through the unique ledger source. User preferences JSON contains only selected species and active category, never an application-state dump.

Private JPEG/PNG/WebP uploads are decoded/re-encoded with Sharp (5 MB, 4096×4096 input bounds), use generated filenames, and have owner metadata in `media_assets`. Files live under `UPLOAD_DIR/private`, never the public media route or version control. Private GET also requires a current avatar/message reference. Unreferenced files are retained privately; automated garbage collection is not implemented. Keep the upload directory private at the web-server level and back it up alongside MySQL.

Tanya Tani uses a server-side provider router for Gemini text/image generation and published local guidance as a final fallback. Authenticated members submit text and photos directly when AI is enabled. The owner requested removal of the demo-account ID restriction and per-turn consent; AI labels and actual provider attribution remain. Legacy browser data remains untouched and is never imported automatically. See the AI setup below and [`../docs/ai-consultation-verification.md`](../docs/ai-consultation-verification.md).

## Gemini consultation setup (Windows)

Install backend dependencies from `backend/`; `@google/genai` 3.6.1 is a backend-only dependency. Preserve the existing database configuration in your ignored **`backend/.env`**. If creating a new environment file, copy `backend/.env.example` first; do not overwrite a working `.env`.

```env
AI_ENABLED=true
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=local
AI_LOCAL_FALLBACK_ENABLED=true
AI_EXTERNAL_MODE=demo
GEMINI_API_KEY=your_primary_key
GEMINI_API_KEY_FALLBACK=your_backup_key
GEMINI_MODEL=gemini-3.5-flash-lite
AI_REQUEST_TIMEOUT_MS=20000
AI_TOTAL_TIMEOUT_MS=30000
AI_MAX_OUTPUT_TOKENS=1024
AI_MAX_CONTEXT_MESSAGES=12
AI_MAX_REQUESTS_PER_MINUTE=5
AI_MAX_CONCURRENT_REQUESTS=2
RAG_ENABLED=false
RAG_API_URL=
RAG_API_KEY=
```

The demo-account allowlist is disabled at the owner's request. `AI_DEMO_MEMBER_IDS` has been retired and is ignored if it remains in an existing `.env`; an empty value no longer blocks Gemini. All authenticated members submit directly to the configured provider without a consent checkbox. `AI_ENABLED=false` or `AI_EXTERNAL_MODE=off` still disables external requests globally; missing keys and eligible failures use local guidance. The `demo` mode label continues to describe the testing context and does not restrict account IDs.

Get keys from [Google AI Studio key management](https://aistudio.google.com/app/apikey). Use the Gemini Developer API, not a browser SDK or `VITE_*` key. Do not store keys in `app_settings`, source files, logs, or CMS forms. Backend diagnostics disclose only configured slots and safe state codes. Restart the backend after changing the keys, model, or global AI switches. No source edits are needed to change the model. No billing or model upgrade is enabled by the application.

The initial candidate is documented to support text and image input with text output: [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). The [pricing page](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite) lists a free standard tier at review time. Actual access, quota, billing settings, and suitable model choice must still be checked in your project. A configured key is not a successful connection test. There is no silent paid-only alternative or automatic model switch.

Before using the new message API, manually apply **`docs/database/05_ai_consultation.sql` once** in phpMyAdmin on the existing schema after script 04. It adds client IDs, payload hashes, request states, leases and unique indexes to the existing conversation/message tables. It creates no table and does not replace data. It has **not** been executed by this task. Do not rerun scripts 01–04, seed, truncate, or reset accounts. Back up normally before manually applying schema changes. Missing columns produce a safe schema error; optional Gemini configuration does not block unrelated login/catalog startup.

From the repository root in PowerShell:

```powershell
Set-Location .\backend
npm install
npm run typecheck
npm run dev
```

In a second terminal at the repository root:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/admin/settings`, sign in as the existing administrator, and use **Integrasi AI → Uji Koneksi AI**. GET diagnostics do not call Gemini. The POST test uses a fixed agricultural prompt and consumes quota, is limited to two tests per admin per minute, and never falls back to local while reporting a successful Gemini test. It verifies text generation only. Its real latency/model and safe result are held in process memory; restart clears them. No live key was present during implementation, so only mock SDK calls have been verified so far.

### Routing, limits, and RAG boundary

`integrations/ai/types.ts` defines text/image requests, stateless context, provider capabilities and normalized metadata. `gemini.ts` uses the maintained SDK's `models.generateContent`, supported roles, system instructions, inline WebP bytes and cancellation. The SDK's automatic retries are disabled (`attempts: 1`); failover attempts each configured key at most once within the total budget. Empty/invalid replies, network errors, eligible server failures, missing configuration and timeouts can fall back. Safety refusals stop routing and are never retried through another key/provider.

The backup key is used after an eligible primary-key failure, including invalid/revoked primary credentials. Invalid credentials are excluded until restart, and invalid model configuration blocks Gemini until restart. Transient key failures cool down for 15 seconds. A 429 cools down Gemini as a whole using at least the API retry delay (or 60 seconds); recognized daily exhaustion uses at least 24 hours. No repeated quota retry or key rotation is attempted. [Google rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) are per project, so two keys in one project share quota. These are application cooldown policies, not assumed Google quota amounts.

Current priority is Gemini → local, with a second Gemini key as internal failover. For future RAG → Gemini → local, configure primary `rag`, fallback `gemini`, and `RAG_ENABLED=true`, **and implement/inject an actual `ConsultationProvider` adapter into `createAI`** after agreeing its contract and privacy policy. `RAG_API_URL`/`RAG_API_KEY` are reserved configuration; no placeholder URL is contacted. Unsupported image modalities skip the RAG provider. The router enforces the global AI switches for external adapters. Genuine sources can be returned by a real future adapter; Gemini does not fabricate sources or use paid grounding tools.

Default limits are 4,000 characters per question, 12 previous messages at up to 4,000 characters each, 1,024 output tokens, five member requests per minute (chat uploads share this limit), two concurrent external calls per backend process, 20 seconds per key request, and 30 seconds total external budget. Local fallback has a separate five-second bound; SQL and HTTP overhead are additional. Limits and circuit state are process-local for this single-process deployment; a multi-instance deployment needs shared rate/concurrency controls.

### Persistence, retries, and privacy

Conversation creation accepts `client_request_id` for deduplication; the frontend creates a record only when submitting a turn. Messages require a stable UUID `client_request_id`, allow `intent` (`identify`, `condition`, `cause`, `grow`, `care`), optional `species` and optional owned `media_id`. Photo-only input gets a suitable default question. The retired `external_consent` field is accepted only to preserve request hashes when older pending turns retry; neither value blocks AI, and new clients omit it. New message metadata does not claim consent was collected. Zod rejects arbitrary URLs, role fields, foreign IDs and extra input fields. The existing session/CSRF/account restrictions still apply.

The initial short authenticated transaction locks the conversation, checks ownership, persists the user turn/hash and reserves a lease. Provider/context work then runs without a transaction or account lock. A second short transaction revalidates session/account/conversation/lease and saves exactly one assistant row with actual provider/model, modality, image flag, safe reason, latency, returned token counts and correlation ID in `rag_metadata_json`. Public responses expose only a safe subset. Old null metadata stays unlabeled rather than becoming Gemini output.

The unique `(conversation_id, role, client_request_id)` index, conversation lock, payload hash and lease prevent duplicate persisted responses and changed-payload reuse. An in-flight duplicate receives `CHAT_PENDING`. Another turn is blocked until the pending/failed turn is resolved; the history screen can reopen it with a **Coba lagi** action. The lease lasts the total timeout plus 30 seconds and can be reclaimed after expiry, including after restart. A revoked session or deleted conversation cannot save/return a generated answer. A lost response after commit is recovered by retrying the same UUID. Cancellation cannot guarantee cancellation of an already accepted Google request; external exactly-once billing is **not** guaranteed.

Member authentication, ownership checks and global AI switches control external access. The owner removed both the account-ID allowlist and per-turn consent prompts for the presentation. Provider payloads exclude member IDs, profiles, sessions, phone/email columns and unrelated conversations. Bounded completed context from the same owned conversation is included without consulting legacy consent flags; refused assistant responses and unfinished turns are excluded. Old photos are not resent. Common phone/email/identity/secret patterns and known account name/identifier values are redacted from text. This cannot guarantee arbitrary text or photos are free of sensitive data. AI/provider labels remain, and [Google's unpaid-service terms](https://ai.google.dev/gemini-api/terms#unpaid-services) still apply. No billing or production certification is enabled by this access change.

Photo uploads stay under `UPLOAD_DIR/private`. Server Sharp decoding enforces 5 MB, static JPEG/PNG/WebP, at most 4096 per dimension/16 million decoded pixels; rotation, 1600 px maximum (no upscaling), WebP quality 85 and metadata stripping are retained. The browser prepares at most 1600 px JPEG quality .88 rather than 720 px, preserving more visible detail; this is not a claim of measured diagnostic accuracy. The server checks consultation purpose, owner, visibility, current avatar exclusion, filename, real path, file existence, actual WebP and output bounds before reading bytes for inline input. No arbitrary URL fetch or external file-upload retention is used. Bytes are not stored in MySQL. Camera capture depends on browser support/trusted localhost or HTTPS; gallery selection remains available. Deleted conversations stop authorizing their photo URLs; private orphan files are retained for later reviewed cleanup.

### Manual live verification

1. Apply SQL 05 once, configure keys/model and enable external AI, then restart both servers.
2. Run the explicit CMS text connection test and inspect the actual result; check the project's quota/model access in AI Studio.
3. Log in as a member and submit a non-sensitive question directly. Ask about growing sorgum, then ask “Bagaimana jika tanahnya terlalu basah?”; verify context-aware replies and Gemini attribution.
4. Select a demonstration plant photo, keep “Belum tahu jenisnya”, choose identification, review the preview, then submit without a checkbox. Verify actual image-aware guidance and `imageAnalyzed: true` only for a successful Gemini image response.
5. Refresh, reopen/search history, logout/login, and restart the backend; confirm records/images/metadata persist. Verify another authenticated member can also submit directly, while global AI disable still uses local guidance.
6. Test a deliberately invalid primary key with the valid backup, then provider unavailability/local fallback. Do not use private member data or repeatedly consume exhausted quota. Review [`../docs/ai-consultation-verification.md`](../docs/ai-consultation-verification.md) for mock/browser evidence and remaining limits.

## API reference

Responses use `{ success, data }` or `{ success: false, error: { code, message } }`.

Public endpoints:

- `GET /api/v1/health`
- `GET /api/v1/health/database` (503 on an unavailable connection/schema)
- `GET /api/v1/categories`
- `GET /api/v1/species`
- `GET /api/v1/species/:slug`
- `GET /api/v1/catalog` (categories plus published species, public media, actions and guides)
- `GET /api/v1/media/:filename` (generated WebP filename with public database metadata)

Authentication:

- `POST /api/v1/admin/auth/login` with email/password and the configured Origin.
- `GET /api/v1/admin/auth/me` returns current administrator and CSRF token.
- `POST /api/v1/admin/auth/logout` revokes the current session.

Protected catalog endpoints:

- `GET /api/v1/admin/dashboard`
- `GET`, `POST` `/api/v1/admin/categories`, `/species`, `/care-actions`, `/guides`
- `PATCH /api/v1/admin/{resource}/:id`
- `GET /api/v1/admin/species/:id`
- `PUT /api/v1/admin/species/:id/care-actions`
- `POST /api/v1/admin/media` multipart fields `species_id`, `state_key`, `alt_text`, `image`
- `GET`, `PATCH` `/api/v1/admin/settings`

CMS lists are filtered in the browser; list endpoints accept no query filters. Unknown keys and invalid IDs are rejected. Write requests require the session cookie, configured Origin, and `X-CSRF-Token` obtained from login or `/auth/me`.

## Security and storage

Session cookies are HttpOnly, SameSite=Lax, restricted to `/api/v1/admin`, and Secure when `NODE_ENV=production`. Sessions expire after the configured number of hours. The database stores SHA-256 hashes of opaque 256-bit session tokens. Every protected operation checks current status, role, expiry and revocation. Password reset, disable, and logout invalidate sessions. Login is limited to 10 attempts per 15 minutes per client IP in this single-process MVP. There is no administrator registration route or startup account creation.

Uploads accept decoded JPEG/PNG/WebP, at most 5 MB, 4096 pixels per dimension and 16 million input pixels. Sharp converts to WebP with a maximum output size of 1600 x 1600, preserves alpha, strips source metadata, and generates UUID filenames. Files are written beneath `UPLOAD_DIR` (relative to `backend/` unless absolute). A failed database transaction removes the new file. Replacement illustrations sort first, preserving previous files, metadata and shared relationships. Built-in assets stay in `public/assets/generated/`. Runtime uploads are ignored by Git. The media route checks public visibility in MySQL; private consultation media is never served.

For deployment, persist and back up both MySQL and the uploads directory. Configure HTTPS and an exact frontend Origin. Serve the frontend build with SPA fallback for `/admin/*`; proxy `/api/*` to the API. Vite's development proxy is not a production server. Run one API instance with the current login limiter, or supply a shared limiter before scaling. Configure any trusted reverse proxy explicitly so client IP limits remain meaningful. Use a restricted MySQL account for the app, and restrict CLI/database access to developers. Old media/session housekeeping is manual; no automatic destructive cleanup runs.

## Architecture

- `config`: startup validation and connection pool.
- `modules/auth`: password verification, sessions, auth/CSRF middleware.
- `modules/admin/provision.ts`: CLI transactions and account policy.
- `modules/admin/catalog.ts`: validated catalog transactions and audit logging.
- `modules/admin/media.ts`: image decoding, file consistency and metadata.
- `modules/admin/routes.ts`: protected HTTP endpoints.
- `modules/catalog`: existing public read queries.
- `integrations/rag.ts`: future provider interface; no live calls.
- `src/admin` in the frontend: CMS interface, separate from the local KWT profile.

Original tables used: `users`, `roles`, `user_roles`, `cultivation_categories`, `species`, `media_assets`, `species_media`, `care_actions`, `species_care_actions`, `cultivation_guides`, `app_settings`, `admin_audit_logs`. `admin_sessions` is an additive twentieth table. No automatic migrations or seed execution exist.

## Verification

```powershell
# backend/
npm run typecheck
npm run build
npm test
npm start

# repository root (another terminal)
npm run lint
npm test
npm run build
npm run test:browser
```

Browser tests use installed Microsoft Edge by default. To use a Playwright browser instead: `npx playwright install chromium`, then `$env:PLAYWRIGHT_CHANNEL='chromium'` before `npm run test:browser`. The browser suite uses in-memory HTTP fixtures, not writes to `dewi_sri`. Backend tests mock database operations and exercise real Argon2id and Sharp. See `docs/cms-verification.md` for actual results and the outstanding live setup dependency.
