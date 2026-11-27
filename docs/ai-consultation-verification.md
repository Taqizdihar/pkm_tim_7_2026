# Tanya Tani: Gemini, persistence, and UI verification

Implementation date: 27 November 2026. Scope: consultation, photos, history, and the CMS AI diagnostics section. No multi-Pet, animation assets, weather, IoT, public registration, or recovery-channel integration was added.

## Access update requested by the owner

The owner subsequently requested that the `AI_DEMO_MEMBER_IDS` restriction be disabled completely. The account-ID check and environment field have been removed. A leftover value in an existing `.env` is ignored. External consultation is now available to all authenticated members when `AI_ENABLED=true`, `AI_EXTERNAL_MODE=demo`, and a provider is configured. Per-turn text/photo consent, ownership, session/CSRF checks, private storage, redaction, limits and fallback continue to apply. CMS diagnostics describe access for all signed-in members instead of counting demo IDs. This supersedes the original prompt's test-account allowlist requirement; it does not disable Gemini itself.

Verification for this access update: backend type checking, all 45 backend tests, backend build, frontend type checking/build, and both targeted Chrome cases (`ai-diagnostics.spec.ts`, `member-chat.spec.ts`) passed. New regressions cover capabilities for two member IDs even with a leftover restrictive setting, and global AI disable despite consent. A safe check of the owner's existing configuration reports external processing enabled and a provider configured, with no claim of a verified connection. No live provider request or developer database write was made for this update.

Scoped quality gate PASS: the changed CMS access text follows the existing typography and layout; Chrome checked it at 320/768/1440 px without horizontal overflow, and the 1440 px screenshot was visually inspected. Authentication/consent and the existing native controls remain functional in the targeted tests. No assets, colors, motion, or unrelated member layouts changed.

## Implementation report

| Area | Delivered behavior |
| --- | --- |
| Gemini integration | Backend-only official `@google/genai` 3.6.1 using `models.generateContent`, system instructions, bounded output, abort signals, and inline image bytes. |
| Dependencies | SDK installed only in `backend/`; no frontend AI SDK, Markdown dependency, or new visual assets. Existing Sharp handles image validation. |
| Model | Environment-controlled `GEMINI_MODEL`, default `gemini-3.5-flash-lite`. Official model/pricing documents were reviewed; actual project access is unverified without a key. No automatic paid model/billing switch. |
| Text consultation | Indonesian agricultural instructions distinguish observations from possible causes, request more evidence when needed, and prohibit administrative side effects or unsupported dosage claims. |
| Photo consultation | Camera/gallery, preview/replace/remove, five intents, optional description and species including “Belum tahu jenisnya”, per-photo confirmation, private upload, actual processed WebP bytes in the request, actual image-analysis metadata on success. |
| Multi-turn context | Bounded recent MySQL text from the owned conversation, allowed roles, consented context only, no historical photo retransmission or client-forged assistant messages. |
| Router/fallback | Gemini primary key → eligible backup key → local guide. Primary/fallback providers are configurable. Missing configuration, network, timeout, invalid response, 5xx, unsupported modality, and quota states have normalized fallback handling. |
| Future RAG | Injectable provider contract/capability boundary, tested with a fake adapter as primary. Reserved RAG variables do not trigger HTTP; real RAG remains deferred. |
| MySQL | Existing conversation/message/media tables, ordered user and assistant records, actual metadata in `rag_metadata_json`, null legacy metadata handled. History remains server-backed. |
| Deduplication/transactions | Stable UUID, normalized payload hash, unique per-role request key, short conversation lock, recoverable generation lease, separate final authenticated transaction. No provider call inside `auth.mutate`. |
| Image privacy | Owner/purpose/visibility/avatar exclusion, generated filenames, real path containment, file existence, actual WebP check, input size/pixel limits, orientation and metadata stripping, inline bytes; no URL fetching or public photo route. |
| Tanya Tani UI | Compact icon actions with accessible names, shorter welcome, one photo entry, growing input, compact send/attach buttons, safe heading/list/emphasis text renderer, copy/image preview, retry using the same request ID, per-response attribution. |
| Responsive layout | Existing measured navigation/composer and virtual-viewport behavior retained. Ten additional AI viewport cases cover empty and long multiline conversation states; existing larger-text and resize regressions also run. |
| History | Existing search/date groups/open/delete/load-more retained, dates normalized on save/open, load-more moved after the list, and search scope described honestly. No empty record just from pressing New. |
| CMS | Authenticated safe provider/key-slot/model/demo/local status and manual quota-consuming test. GET does not call Gemini. Real test result/latency is held in process memory. No secret editor. |
| Automated checks | Frontend: type checking, 20 unit tests and production build passed. Backend: type checking, 43 mock/HTTP/unit tests and build passed. Final browser results are recorded below. |
| Live provider | **Not verified by these automated checks.** Both keys were absent at initial implementation and were subsequently configured by the owner. No live result is fabricated. |
| Configuration | Add the two keys to `backend/.env`, choose an accessible multimodal model, enable external AI, restart backend, then explicitly test in CMS. No member-ID list is needed. |
| Manual SQL | **Required and not executed:** apply `docs/database/05_ai_consultation.sql` once in phpMyAdmin after 04. No table, seed, account, credential, or existing record was changed during implementation. |
| Limits | External mode remains labeled `demo`, with access for all authenticated members by owner request. No real RAG, no physical-device keyboard tests, process-local quotas/cooldowns/diagnostics, no guarantee of exactly-once provider billing, no automatic orphan-file cleanup. |
| Git | Commit and push are reported in the delivery message. No keys, ignored environment, dumps, private images or screenshots belong in the commit. |

## Key configuration

Use the existing ignored `backend/.env`, **not** a root frontend environment or any `VITE_*` variable:

```env
GEMINI_API_KEY=your_primary_key
GEMINI_API_KEY_FALLBACK=your_backup_key
GEMINI_MODEL=gemini-3.5-flash-lite
AI_ENABLED=true
AI_EXTERNAL_MODE=demo
```

All signed-in members can confirm external processing; the retired `AI_DEMO_MEMBER_IDS` setting is ignored. `AI_ENABLED=false` or `AI_EXTERNAL_MODE=off` still disables external calls globally. See [`../backend/.env.example`](../backend/.env.example) for all validated defaults, including provider priority, context/output caps, timeouts and concurrency.

The primary key is tried first. Invalid primary credentials are disabled until restart and eligible transient errors can use the backup once. Model misconfiguration blocks Gemini until restart. Safety refusals never trigger a backup/provider bypass. A quota response cools down Gemini rather than rotating keys; Google applies quota per project, not per key. A second key from the same project does not increase quota. An exhausted daily quota is not repeatedly retried. Failover uses the same configured model and never enables billing.

## Test evidence and practical bounds

Backend `ai.test.ts` exercises SDK inputs (model, roles, bytes/MIME, limits), text/image results, invalid credentials, 5xx, empty response, missing keys, timeout/abort, RetryInfo parsing, quota cooldown, safety refusal, fake RAG routing, privacy eligibility, redaction and concurrency. `ai-http.test.ts` checks existing authorization boundaries, safe diagnostics, no automatic provider call, manual-test limits and member rate limits. `chat-turn.test.ts` uses isolated SQL fixtures and temporary non-sensitive generated pixels for ownership/media, actual metadata, ordered history, duplicate/hash conflicts, simultaneous submissions, stale/failed recovery, deletion and session revocation during generation, and the absence of an open transaction during external calls. Existing auth/CMS/catalog/care regressions are retained.

These persistence tests simulate the SQL boundary; they are **not** a destructive integration run against the developer's `dewi_sri` database. SQL 05 and real database end-to-end behavior remain manual verification steps. The schema is additive and uses existing MySQL 8-compatible columns/indexes. The application never applies it at startup.

Final check results:

| Command/check | Result |
| --- | --- |
| Root `npm run lint`, `npm test`, `npm run build` | Passed; 20 unit tests. Final lint/build repeated after the last UI changes. |
| Backend `npm run typecheck`, `npm test`, `npm run build` | Passed; 43 tests. The 13 provider/router cases and backend type/build checks also passed after the final safety-error normalization change. |
| Chrome full regression run | 59 of 61 passed initially; two timing-sensitive assertions were then corrected as described below. |
| Chrome focused final run (`ai-consultation.spec.ts ai-diagnostics.spec.ts bottom-sheets.spec.ts member-chat.spec.ts`) | 22 of 22 passed, including both corrected assertions and the new CMS case. Combined with the other passing regression cases, all 62 distinct browser scenarios have passing results across these runs. |
| Final photo screenshot check | Photo case rerun separately after changing only screenshot capture positions. |
| Live Gemini / real MySQL AI workflow | Not run by the initial implementation tests: keys were absent then, and SQL 05 was intentionally left for manual application. |

Run browser checks on Windows with `$env:PLAYWRIGHT_CHANNEL='chrome'` followed by `npm run test:browser`. The default Playwright channel is still Edge unless overridden. No physical-device or unrestricted production verification is claimed.

Chrome tests in `ai-consultation.spec.ts` cover 320×568, 341×760, 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900 and 1920×1080. They exercise compact empty state, multiline questions, long assistant text, safe text-only Markdown, latest-answer reachability above the composer, honest local attribution, same-ID retry, photo confirmation with unknown species, image preview, search and reopened history. JavaScript errors and horizontal overflow are checked. Other responsive tests cover larger text, growing input, in-place DevTools resizing and simulated visual viewport keyboard changes. These are Chrome simulations rather than actual Samsung/iPhone/Pixel devices or iOS Safari.

Screenshots live under ignored `.artifacts/tanya-tani-review/`: empty and answer states at 341/768/1440, photo preview/consent at 360, and CMS diagnostics at 1440. A full-page capture initially placed fixed navigation in the middle of the artifact; the photo review now uses two viewport captures at the preview and consent/submit positions. Representative images are visually inspected in addition to assertions.

Two timing-sensitive browser assertions were corrected: local attribution is scoped to the assistant reply rather than a transient header status during capability loading; the bottom-sheet test records the actual native animation call rather than assuming the 280 ms entrance is still running after browser automation returns. Product animation timing is unchanged.

## Design quality report (changed application areas)

The project application requirements in `AGENTS.md` govern this review; landing-page hero, marketing statistics, and decorative asset requirements do not replace the member consultation workflow.

- R-03 / C-4 PASS: Chrome cases cover the ten requested AI viewports, multiline/long replies and scroll reachability; existing tests cover large text, keyboard viewport signals and responsive resizing. Empty 341 px, long answer 341 px, photo form 360 px, and CMS diagnostics 1440 px artifacts were inspected visually.
- R-24 / R-26 / R-32 / R-39 PASS: native buttons/fields retain visible labels or accessible names; browser flows exercise send, same-ID retry, gallery, unknown species, confirmation, photo preview/Escape, history search/open/delete and CMS testing. Header targets are at least 44 px; send/attach targets are 48 px wide. Existing focus and reduced-motion dialog checks remain active.
- R-25 PASS: the composer placeholder retains `#506458` on `#fafcf6` (6.15:1 WCAG relative-luminance ratio); new text uses the existing dark ink/muted palette on the existing ivory/white surfaces.
- R-17 / R-18 / R-23 / R-36 / R-38 / C-5 PASS: no asset generation, marketing claims, fabricated sources, live verification claims, or test member data was added to the shipped application. Test API/model results are explicitly fixtures in tests and this report.
- R-27 / R-35 PASS: empty, upload/preparation, waiting, fallback, failed/retry and diagnostics states are functional; frontend/backend builds and the recorded automated checks validate behavior. Live Gemini and MySQL migration remain explicitly unverified/manual.
- Purpose-Gate / C-1 / C-3 PASS: the leaf and existing plant connect the screen to agricultural care; compact controls leave more room for questions, and per-message attribution explains mixed local/AI answers. No unrelated screen sections or decoration were added.
- Liveliness / R-37 PASS: `DESIGN.md` supplies ENERGY 2 / RHYTHM 2 / MOTION 1, leaf motif, existing plant illustration, green/ivory/peach and Nunito Sans. The consultation welcome remains the initial focal point and conversation text takes focus after submission.
- Quality Locks / C-2 PASS: existing spacing/radius/type families and explicit Indonesian actions remain; plain text-only Markdown renders headings/lists/emphasis while escaping raw HTML and never executing model content. API keys and detailed model configuration stay out of ordinary member flows.

## Privacy and deployment boundaries

The backend checks the global AI switches and explicit per-turn consent before any external provider request, and the member API requires an authenticated session. The owner removed the account-ID restriction. No member ID, account/profile row, session, email/phone columns, unrelated thread, or photo filename is added to provider payloads. Text redaction removes common identifiers and known account identity values but cannot prove arbitrary content is safe. Photo confirmation is essential; the app has no claim of automatic face/document detection. Unconfirmed requests still use local guidance.

Google's unpaid terms and the existing processing notices continue to apply. The access change removes the member-ID restriction without enabling billing or claiming production readiness. The external mode labels remain `off` and `demo`; they now control whether authenticated members can opt in rather than identifying a test-account list.

Uploaded files remain private after deletion; the ownership/reference query no longer authorizes photos whose only conversation was deleted. Files are retained for reviewed orphan cleanup, avoiding accidental deletion of avatars/shared assets. The browser now prepares at up to 1600 px instead of 720 px and the server keeps its 1600 px cap; fine-detail diagnostic accuracy is not claimed or clinically measured.

If the process crashes, a pending turn can be reclaimed after its lease (total timeout plus 30 seconds) using its original client UUID/payload. A stale worker cannot commit over a newer lease. If the response was saved but its HTTP reply was lost, retry returns the persisted conversation without creating a second assistant. A user must resolve an unfinished turn before starting another in that conversation. The external service may still process/bill a request after local cancellation, so exactly-once billing cannot be guaranteed. Per-member rate limits, global concurrency, cooldowns and diagnostics currently belong to one backend process; scale-out requires shared enforcement.

## Demonstration checklist

- Apply SQL 05 once manually and keep the existing schema/seed/accounts intact.
- Obtain keys in Google AI Studio and put them only in `backend/.env`; verify the project/model quota and billing settings.
- Use `AI_ENABLED=true` and `AI_EXTERNAL_MODE=demo`, then restart backend. No member IDs need configuration.
- Run **Pengaturan → Integrasi AI → Uji Koneksi AI** explicitly; this consumes quota and verifies text only.
- Use a signed-in member to consent to a non-sensitive agricultural question and contextual follow-up.
- Review/confirm a prepared photo, identify an unknown plant, and inspect actual image-aware reply/metadata.
- Refresh/logout/login/restart backend and reopen history; verify text, photos and metadata from MySQL.
- Verify another signed-in member can also opt in, unconfirmed requests stay local, and fallback never claims image analysis.
- Check a deliberately invalid primary key with the valid backup; do not rotate keys around project quota or safety restrictions.

## Sources reviewed

- [Official JavaScript SDK](https://github.com/googleapis/js-genai) and installed 3.6.1 TypeScript declarations for supported method signatures/cancellation/retry options.
- [Gemini documentation](https://ai.google.dev/gemini-api/docs), [model list](https://ai.google.dev/gemini-api/docs/models), and [3.5 Flash-Lite model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) for model/input/output support.
- [Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding) for inline image input.
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [API keys](https://ai.google.dev/gemini-api/docs/api-key), and [unpaid-service terms](https://ai.google.dev/gemini-api/terms#unpaid-services) for setup/quota/privacy considerations. Model/project access and terms must be rechecked before deployment.
