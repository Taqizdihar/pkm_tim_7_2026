# CMS implementation and verification

Date: 24 November 2026 (Asia/Jakarta).

## Implementation report

1. **Backend:** extended the existing Express service with validated CMS transactions, audit logs, secure image processing, and authentication. No duplicate backend or ORM was introduced.
2. **CMS:** Indonesian login, dashboard, Pet/category management, care actions, plain text guides, and allowlisted settings at `/admin/*`. Responsive card lists and forms use the existing Dewi Sri colors.
3. **CLI:** `admin:create`, `admin:list`, `admin:reset-password`, `admin:disable`; interactive masked password entry, Argon2id, transactional role assignment, duplicate rejection and last-active-admin protection.
4. **Authentication:** opaque cookie sessions, hashed tokens in MySQL, role/status checks per protected request, expiration/revocation, CSRF and Origin checks, rate-limited login, Secure production cookies. No browser registration or LocalStorage admin tokens.
5. **Existing tables:** users, roles, user_roles, cultivation_categories, species, media_assets, species_media, care_actions, species_care_actions, cultivation_guides, app_settings, admin_audit_logs. Original schema/seed and the 19-table ERD remain preserved.
6. **Manual SQL:** `docs/database/03_admin_sessions.sql` adds the supplementary `admin_sessions` table. It was prepared but **not executed**. Local information_schema inspection confirmed it is absent. Apply it in phpMyAdmin before real administrator login/reset/disable.
7. **Images:** built-in assets stay in Git. Runtime uploads go to ignored `backend/storage/uploads`; only public metadata-backed UUID WebP files are served. Files are decoded, bounded, stripped of source metadata and converted; alpha survives. Previous media associations remain intact, and failed transactions clean up new files.
8. **Public app:** dynamic slugs, categories, illustrations, three configured actions and published guides load through the API. Existing progress, journals, schedules and local consultation behavior remain. Archived metadata is retained for history. An explicit fallback notice appears if the API fails.
9. **API:** existing health/categories/species endpoints remain; `/catalog` and controlled `/media/:filename` were added. Protected `/admin/auth/*`, `/admin/dashboard`, category/species/action/guide create-update lists, species detail/action assignment, multipart media, and settings are documented in `backend/README.md`.
10. **Verification:** backend typecheck/build and frontend typecheck/build passed. Backend tests use mocked MySQL and real Argon2id/Sharp; frontend tests include dynamic slug and archive retention. Playwright uses Microsoft Edge and HTTP fixtures without database writes. See results below.
11. **Live MySQL:** read-only checks succeeded on the existing local database: health 200, database health 200, catalog 200 with 11 species, Sorgum detail 200. An unauthenticated CMS dashboard request returned 401. Ayam Jantan is not present in the real database (404), as no demonstration records were inserted.
12. **Limits:** real CLI provisioning, session-backed login and CMS database writes await the manual SQL setup and the developer's own account. The publish/upload/archive browser workflow was verified with fixtures, not live writes. KWT user data is still local. RAG, live weather and AI photo analysis are not connected. Settings are stored safely; built-in public branding is unchanged. Login limiting is per API process. Upload storage requires persistent hosting and backups.
13. **Delivery:** implementation is committed on `main` and pushed to `origin/main`; the completion message supplies the final commit SHA.

## Test evidence

| Check | Result |
| --- | --- |
| Backend TypeScript + build | Pass |
| Backend automated tests | 12 passed |
| Frontend TypeScript + build | Pass |
| Frontend automated tests | 20 passed |
| Playwright responsive navigation/forms | Pass at 320, 390, 768, 1440 px |
| Playwright Pet publish/upload/actions/public selection/archive workflow | Pass with HTTP fixtures |
| Playwright category/action/guide/settings forms and logout | Pass with HTTP fixtures |
| Live MySQL health/catalog access | Pass, read-only |
| Live administrator write workflow | Pending manual session table and developer-provisioned account |

The backend tests cover wrong credentials, non-admin/disabled rejection, cookie persistence, expired/revoked sessions, CSRF, logout, rate limiting, password hashes, CLI role assignment/duplicates/rollback/reset/disable, last-admin protection, species publication/archive, cyclic categories, action associations, guide publication, invalid image contents/dimensions and failed-upload cleanup. Frontend tests retain Sorgum's wilted/normal behavior and exercise a new database slug without a hardcoded union.

`npm run admin:list` was also run against the live database and completed successfully with an empty list. Provision your own account after adding the session table.

Browser screenshots are generated under `.artifacts/` and intentionally excluded from Git. Browser fixtures contain clearly labeled test accounts and records; none are provisioned in MySQL. No DDL, seed, automatic schema sync or reset was run.

## UI quality review

Direction: an internal agricultural catalog workspace for developers, using Dewi Sri green and warm ivory, ENERGY 1 / RHYTHM 2 / MOTION 1. Functional lists, readable forms and restrained navigation take priority over decorative sections. Leaf identifies the existing brand; plus, back and logout icons accompany their actual actions. Flat green highlights identify the current section and save action. Shared typography and spacing preserve the established product identity.

- Hard Gate PASS: pages were built and exercised in Edge; viewport assertions found no horizontal overflow at the four tested sizes. Form labels, native buttons, image alt text and focus styles were checked in source and rendered screenshots. Statistics come from SQL; test browser statistics are identified as fixtures in this report.
- Purpose Gate PASS: the interface uses the existing brand palette and a single card/form system; icons name actual actions, without decorative animation or marketing sections.
- Liveliness PASS: green leaf identity, warm background, section highlighting and a clear page heading establish the catalog workspace. The desktop sidebar becomes a compact wrapping navigation on phones.
- Craftsmanship PASS: automated checks exercised navigation, data entry, upload feedback, publication, selection, care recording and archiving. Loading/error/empty messages exist; refresh is covered by the browser workflow. Real MySQL admin writes remain explicitly pending the documented manual dependency.

## Next local actions

1. Start MySQL in Laragon.
2. In phpMyAdmin, select `dewi_sri`, paste the complete `03_admin_sessions.sql` into SQL, then click Go. Do not rerun scripts 01 or 02.
3. From `backend/`, run `npm run admin:create` and enter your own administrator name/email/password.
4. Run `npm run dev` from `backend/` and from the repository root in separate terminals.
5. Open `http://localhost:3000/admin/login` and log in.
6. Create Ayam Jantan as a draft under Ayam, upload its normal image, assign up to three actions, save them, and publish.
7. Open the public app, choose Ayam, and verify the new Pet. Test logout and CLI password reset with your own account.

Full Windows commands and production considerations are in `backend/README.md`.
