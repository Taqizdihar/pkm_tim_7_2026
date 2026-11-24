# Dewi Sri API and internal CMS

Express 5 + TypeScript extends the existing MySQL database. Authentication uses Argon2id and database sessions; catalog writes use validated parameterized SQL, transactions, and audit logs. The public app retains its local profiles, journals, schedules, and conversations.

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

   Enter a name, email, and password twice. Password input is masked. Use at least 12 characters including uppercase, lowercase, digits, and a symbol. Credentials are never passed as command arguments. Duplicate emails are rejected without changing existing roles. Creation discovers the `admin` role by code and inserts the user and role atomically. `email_verified_at` remains NULL: this is internal developer provisioning, not email verification.
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
- `/admin/settings`: allowlisted `app_name` and `welcome_message` storage. These fields are managed in the CMS; changing the built-in application branding is outside this MVP. RAG, live weather and AI image analysis stay unavailable.

To add **Ayam Jantan**, create a draft with slug `ayam-jantan`, select **Ayam** (Kandang), and save. Upload a `normal` illustration, optionally `sick` or custom states, then assign care actions and save them. Set status to **Terbit** and save. Open or focus the public app at `http://localhost:3000/?screen=beranda`, choose **Ayam**, and select the new species. Published guides also appear in the species guide dialog. Archive removes a species from new selection while keeping database relationships and local history.

There are no physical delete endpoints. Archive species/guides and deactivate categories/actions instead. Slugs are stable local-storage identifiers: avoid renaming the slug after publishing; a renamed slug starts a distinct local progress entry, while prior entries remain preserved.

## API

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
