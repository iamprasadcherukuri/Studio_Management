# Photography Studio Management

Local React + Express + PostgreSQL application for one photography studio with multiple users. Includes customers, bookings and staff assignments, offline installment payments with printable receipts, album delivery tracking, expenses, CSV reports, users, packages, staff and studio settings. Light blue responsive interface; all dashboard values come from PostgreSQL.

## Windows setup

Install Node.js 22.12+ and PostgreSQL 16+. Open PowerShell in this directory.

```powershell
npm install
if (!(Test-Path backend/.env)) { New-Item backend/.env -ItemType File }
```

Edit `backend/.env`. Set `DATABASE_TARGET=local`, `DATABASE_URL` to your PostgreSQL connection, `DB_SCHEMA=studio`, `JWT_SECRET`, `SETUP_TOKEN`, and `FRONTEND_URL=http://localhost:5173`. URL-encode special characters in the password. The application uses local database `studio_db` and schema `studio`. Environment files are intentionally excluded from Git. For a new installation, connect with pgAdmin or psql and run `CREATE DATABASE studio_db;` first. Use a dedicated database owner for normal deployment rather than a PostgreSQL superuser.

Generate separate random secrets for `JWT_SECRET` and `SETUP_TOKEN` (at least 32 and 24 characters respectively):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:init
npm run db:migrate -w backend
# Optional packages only, clearly labeled demo data:
npm run db:init -w backend -- --demo
npm run dev
```

Open http://localhost:5173. API runs on http://localhost:4000. The first screen creates an administrator using the local `SETUP_TOKEN`, your name, email and a password of at least 12 characters. No account or credentials are seeded. Setup locks after the first account exists; remove `SETUP_TOKEN` from your environment after setup. Sign in after creating the administrator. Create studio details, packages and staff under Settings; then customers and bookings.

`schema.sql` is idempotent for fresh installation, not a migration mechanism. Schema name is fixed to `studio` in SQL; keep `DB_SCHEMA=studio`. PostgreSQL credentials and both generated secrets must remain private. `.env` is ignored. Session JWTs last 8 hours, are stored in browser session storage and checked against active users on every API request. Use HTTPS and a reverse proxy for any remote deployment. Express binds to `0.0.0.0` and the configured port for Render compatibility; keep local development behind your firewall.

## Commands

- `npm run dev`: start both applications.
- `npm run build`: production frontend build.
- `npm test`: validation tests.
- `npm run verify`: API integration checks in an isolated temporary PostgreSQL schema.
- `npm run verify:browser`: Chrome browser checks of forms, navigation, receipts, CSV, settings, first-login password changes and desktop/mobile layout. Requires locally installed Google Chrome and free ports 14000/15173. Screenshots are saved in ignored `test-results/`.
- `npm run db:init`: initialize PostgreSQL schema.
- `npm run start -w backend`: start API without watch mode.

For a frontend production preview run `npm run preview -w frontend -- --host 127.0.0.1`; configure an `/api` reverse proxy to the API for production hosting. Vite's development proxy is supplied for local development.

## Behavior and permissions

New accounts created under Users receive a temporary password (generated automatically when the field is blank). It is shown once after creation for secure sharing. At first login, users must set a different password of at least 12 characters before they can access any workspace API. Changing the password invalidates previous sessions and requires signing in again. Existing accounts are preserved. The initial administrator setup continues to use the password chosen during secure setup. Run `npm run db:init` when upgrading to add the new account fields without altering existing records.

Admin has full access. Staff can read the dashboard and manage customers, bookings and albums; financial modules, reports, settings, user management and all deletion require admin. Permissions are enforced by the API. Customers, packages and staff referenced by bookings cannot be deleted. Bookings and albums are retained; update their workflow state instead. Users can be disabled, and disabled users immediately lose API access.

Payments are append-only receipts. Every submission has a UUID idempotency key, and the booking is locked inside a transaction before validating its outstanding balance. Retrying the same submission returns the original receipt. Overpayments and payments to cancelled bookings are rejected. Agreed amounts cannot be lowered below net receipts; bookings with net receipts cannot be cancelled. Full and partial reversals are separate audited records, never edits to the original payment. Amounts use PostgreSQL `NUMERIC(12,2)` and validation allows two decimal places. Printing cost on an album is an estimate; enter the actual paid cost once under Expenses. Booking advances are entered once through Payments. Net cash balance means net receipts after reversals minus expenses paid, not accounting profit.

Reports use inclusive date ranges. Receipt reports filter payment date, expense reports expense date, booking/outstanding/customer reports event date, and album reports actual delivery date or expected date if undelivered. Outstanding reports show current balances for bookings in the event-date range; they are not historical balance snapshots. Category totals and daily/monthly/yearly receipts are available. Customer History on the Customers page shows bookings, paid totals and balances. CSV export protects spreadsheet formula cells.

## REST API

All endpoints start with `/api`. Send JSON bodies. Authenticated calls require `Authorization: Bearer <token>`. Errors return `{ "error": "message" }`; validation errors use HTTP 400, authentication 401, permission 403, missing records 404, duplicate/linked records 409. Lists return `{data,total,page,limit}` (users returns `{data}`).

| Endpoint                                                | Purpose                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET /health                                             | Database connectivity                                                     |
| GET /auth/status                                        | Whether first setup is complete                                           |
| POST /auth/setup                                        | First admin: name, email, password, setup_token                           |
| POST /auth/login                                        | email, password → token and user                                          |
| GET /auth/me                                            | Current active account                                                    |
| GET /dashboard                                          | PostgreSQL metrics, monthly chart, upcoming/recent bookings, album counts |
| GET /lookups                                            | Customers, bookings, event types, packages, staff                         |
| GET, POST /customers                                    | List/search and create                                                    |
| PUT, DELETE /customers/:id                              | Edit / safely delete                                                      |
| GET /customers/:id/history                              | Booking and payment history                                               |
| GET, POST /bookings                                     | List and create, with staff_ids array                                     |
| PUT /bookings/:id                                       | Edit booking and staff assignments                                        |
| GET, POST /payments                                     | List / append receipt (idempotency_key UUID required)                     |
| GET, POST /albums                                       | List and create                                                           |
| PUT /albums/:id                                         | Edit workflow and delivery acknowledgement                                |
| GET, POST /expenses                                     | List and create                                                           |
| PUT, DELETE /expenses/:id                               | Edit / delete paid expenses                                               |
| GET, POST /packages, /staff                             | Manage booking choices                                                    |
| PUT, DELETE /packages/:id, /staff/:id                   | Edit / safely delete                                                      |
| GET, POST /users                                        | List / create name, email, password, role                                 |
| PATCH /users/:id                                        | Enable / disable with active boolean; cannot disable yourself             |
| GET, PUT /settings                                      | Studio name, phone, email, address                                        |
| GET /reports?type=summary&from=2026-01-01&to=2026-12-31 | Admin reports                                                             |

List parameters: `search`, `page` (1+), `limit` (1–100); bookings/albums accept `status`; expenses accepts `category`. Bookings, payments, albums and expenses accept `from` and `to`. Report types: `summary`, `daily`, `monthly`, `yearly`, `receipts`, `bookings`, `outstanding`, `expenses`, `categories`, `albums`, `customers`. Report CSV generation and receipt printing occur in the browser. Form field names correspond to SQL columns; validation is in `backend/services/validation.js`. Monetary writes and deletes have transaction-backed audit records.

## Verification steps

1. Run `npm test` and `npm run build`. Start both apps and check `/api/health`.
2. Complete setup; verify a second setup request is rejected. Sign in and check incorrect-password feedback.
3. Add, search and edit a customer. Confirm empty history, then add a booking for that customer. Confirm deletion of the linked customer is blocked.
4. Add a package and staff in Settings; assign them to a booking. Edit date/status and verify Dashboard and history change.
5. Record a partial offline payment; check outstanding amount. Print its receipt. Attempt an overpayment and verify rejection. Retry an identical idempotency key and verify only one receipt exists.
6. Add an album, move it through workflow stages, and try Delivered without acknowledgement (rejected). Enter actual date and acknowledgement; verify delivery tracking.
7. Add, filter, edit and delete an expense. Check dashboard balance = received − paid expenses.
8. Compare daily/monthly/yearly receipts and expense/category reports with records. Change dates, export CSV, check outstanding balances and customer history.
9. Create a staff account. Sign in in a separate browser session; verify permitted pages work and direct financial/user/settings API access returns 403. Disable it from the administrator session and check access is revoked.
10. Resize to mobile, navigate with the keyboard, check form errors, empty lists, pagination and printable receipt output.

Automated tests cover validation rules. Build and database/API checks performed during implementation are reported in the delivery response; the manual browser checks above are a repeatable checklist, not a claim that they have all run.

## Invoice PDFs and equipment enhancements

The existing UI and authentication are retained. Administrators now have Invoices and Equipment sidebar entries. Staff permissions remain unchanged. Invoice and equipment dashboard metrics are separate from cash receipts and expenses.

### Installation and additive migration

```powershell
npm install
# First installation only: initialize existing core tables.
npm run db:init
# Existing and fresh installations: takes a backup, then applies tracked additions.
npm run db:migrate -w backend
npm run dev
```

Migration `001_invoices_equipment` adds five feature tables and `schema_migrations`, indexes, constraints and two protective triggers on existing tables. It never recreates or clears core tables. The runner uses a transaction and advisory lock, verifies existing row counts and validated constraints, and skips applied versions. The invoice trigger prevents changing an issued invoice's booking customer/amount or cancelling it until the invoice is voided. The expense trigger protects maintenance-linked expenses from editing/deletion. Other existing CRUD contracts remain unchanged.

`npm run db:backup -w backend` takes a full custom-format local dump and row-count manifest from the same PostgreSQL snapshot in ignored `backups/`. It checks the archive with `pg_restore --list` and writes a SHA-256 verification manifest. PostgreSQL 18 Windows tools are detected at the standard install location; override `PG_BIN_PATH`, `PG_DUMP_PATH` or `PG_RESTORE_PATH` if needed. Keep backups private because they contain business data and password hashes. The verified backup/restore tooling is restricted to local PostgreSQL and refuses hosted targets. `npm run db:rollback -w backend` backs up and rolls back only the latest applied migration when all feature/reversal tables are empty; it refuses rollback otherwise. It does not drop existing core tables. Never bypass this guard to remove live feature data. Production changes require a separately reviewed target backup and explicit approval.

### Invoice and receipt rules

- One active invoice per booking; invoice items minus discount must equal its agreed amount. Quantity has up to three decimal places; item values are rounded half up to paise, then summed using Decimal/PostgreSQL numeric arithmetic. Financial API results are decimal strings.
- Tax is disabled; nonzero tax requests are rejected. No GST assumptions or tax rate are introduced.
- Invoice numbers are unique sequence-based identifiers; gaps are possible on rolled-back writes. The active-booking unique index and UUID idempotency key prevent duplicate billing events.
- Issued customer/studio details and line items are snapshots. Paid and outstanding amounts reflect current booking receipts, including advances received before invoicing. Voided invoices remain in history with reason, user and time; they have zero invoice balance and are excluded from invoice dashboard totals. Replacement invoices inherit existing booking payments without creating payments.
- Invoices provide details/history, PDF preview, download, printing, and audited voiding. PDFKit produces A4 documents with an embedded open Noto Sans font including the rupee symbol. No logo was configured in the existing studio profile, so documents currently use text branding. Terms are configured per invoice. The signature placeholder appears on receipts.
- Payment History adds a receipt PDF button. PDFs reuse the existing `PAY-<payment ID>` receipt number; repeated downloads create no receipt or payment rows. The original browser print receipt remains available. Receipt details use current studio/customer details and show current booking payment totals. No payment amounts are changed.

### Equipment and expense rules

Inventory supports unique asset codes, category/status filters, purchase details, edits, details, retirement, and assignment/service history. There is no equipment deletion API. Retired assets cannot be reassigned or edited.

Reservations cover whole days including both boundary dates and must include the booking's event date. Equipment rows are locked during reservation writes. Overlapping active reservations, overdue unreturned assets, maintenance and retirement block assignment. Future reservations are retained in history; Assigned indicates an asset whose assignment has started and is not returned. Return dates cannot be in the future or precede assignment. Resolve all reservations before starting maintenance or retirement. Bookings retain their existing editable dates; if an event date changes, review equipment reservations because their dates do not move automatically.

Purchase cost and maintenance cost do not automatically count as paid expenses. From a maintenance row, explicitly record a paid Equipment expense, or link an existing Equipment expense with exactly the same amount. Each maintenance record can link one expense, and each expense can link one maintenance record. Retrying cannot create another expense. Linked expenses are protected from edits/deletion, preventing ledger/history divergence. Completing maintenance returns the asset to availability. Completed services cannot be reopened; add a new service instead.

### Added API endpoints

All use existing JWT/first-login enforcement and require administrator access. Lists return the existing paginated envelope. Invoice and equipment lists support `search`, `page`, `limit`; invoices support `status`, equipment supports `category` and availability `status`. Assignment/maintenance lists accept `equipment_id`.

| Endpoint                                    | Behavior                                                                                |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| GET, POST /api/invoices                     | Search/list or issue from a booking with items, dates, discount, terms, idempotency_key |
| GET /api/invoices/:id                       | Snapshot, exact amounts, current paid/balance, items and audit history                  |
| GET /api/invoices/booking/:id               | Booking amount and event information for invoice creation                               |
| GET /api/invoices/:id/pdf                   | PDF attachment; `?preview=1` returns inline                                             |
| POST /api/invoices/:id/void                 | Void with a required reason                                                             |
| GET /api/payments/:id/receipt/pdf           | PDF of an existing payment; supports inline preview                                     |
| GET, POST /api/equipment                    | Inventory list or create                                                                |
| GET, PUT /api/equipment/:id                 | Details/history or edit                                                                 |
| PATCH /api/equipment/:id/retire             | Retire while preserving history                                                         |
| GET, POST /api/equipment-assignments        | History/list or reserve                                                                 |
| PATCH /api/equipment-assignments/:id/return | Return with actual_return_date                                                          |
| GET, POST /api/equipment-maintenance        | Service history/list or create                                                          |
| PATCH /api/equipment-maintenance/:id        | Update status and next_service_date                                                     |
| POST /api/equipment-maintenance/:id/expense | Explicitly create paid expense (date, method) or link existing_expense_id               |
| GET /api/feature-summary                    | Invoice and equipment metrics, without altering cash metrics                            |

### Enhancement verification

```powershell
npm test
npm run verify
npm run verify:features -w backend
npm run verify:browser
npm run build
```

All integration/browser fixtures use temporary `studio_test_*` schemas and are cleaned up. The feature suite tests migration rerun and rollback, existing customer/booking operations, exact invoice totals, duplicate events, PDF responses, receipt regeneration, void/reissue, concurrent assignments, returns, maintenance/expense linking, cash totals and permissions. Browser checks exercise the new screens and existing modules. Browser scripts use separate ports 14000/15173 and installed Chrome, leaving the local app servers alone.

## Supabase connection and migration review

The supplied hosted connection is stored only in ignored `backend/.env.supabase`; local `backend/.env` remains unchanged. `backend/.env.supabase.example` contains no credentials. Password special characters are URL-encoded. TLS certificate and hostname verification remain enabled. Save the certificate downloaded from Supabase Database Settings → SSL Configuration to `backend/certs/supabase-ca.crt`, or set an absolute `SUPABASE_CA_PATH`. Never use `rejectUnauthorized:false` to bypass a failed connection check.

```powershell
# Read-only hosted connectivity, TLS and schema check:
npm run cloud:verify -w backend
# Export LOCAL studio schema/data and row-count manifest for review only:
npm run cloud:prepare -w backend
```

`cloud:prepare` writes `.dump`, `.sql` and `.counts.json` artifacts to ignored `backups/`; it never writes to Supabase. The SQL includes existing records, sequences, constraints, feature tables and migration history. Inspect it privately before approval. `PG_BIN_PATH` can override the PostgreSQL tool directory (include a trailing slash).

The configured target database is `studio_db` as supplied; this must be verified. Supabase commonly provides database `postgres`; do not silently switch or create a database. Once the CA is installed, `npm run cloud:verify -w backend -- --database=postgres` can perform a read-only diagnostic against that database if needed.

Cloud migration remains pending explicit approval. Review sequence: verify target identity/version and schema state; back up any existing remote studio data; stop application writes during the final local export; compare export counts; inspect the SQL for target-version compatibility; restore only into an approved empty destination schema with no clean/drop flags; verify counts, constraints and sequence values; run authenticated smoke tests; then switch the backend connection. If the target schema already has records, plan a merge explicitly rather than restoring over it. Keep `studio` out of Supabase's exposed Data API schemas; the Express API provides authorization. Do not replace JWT login with Supabase Auth.

After approval and destination readiness, the restore command pattern for Windows is below. It is documentation only; it has not been run against Supabase. `--password` prompts without embedding the secret in shell history. Replace the review dump filename and use the verified database name:

```powershell
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$env:PGSSLMODE = 'verify-full'
$env:PGSSLROOTCERT = (Resolve-Path backend/certs/supabase-ca.crt).Path
& "$pgBin\pg_restore.exe" --host=aws-1-ap-southeast-1.pooler.supabase.com --port=5432 --username=postgres.PROJECT_REF --dbname=VERIFIED_DATABASE --no-owner --no-acl --single-transaction --exit-on-error --password backups/REVIEWED_EXPORT.dump
```

`npm run start:supabase -w backend` explicitly selects the prepared Supabase connection and a pool of five clients while preserving the local default. It accepts platform environment variables without requiring local environment files. It requires the CA certificate (or `SUPABASE_CA_CERT`) and a migrated target schema. It does not initialize or migrate the hosted database. Use a dedicated runtime role and separate production JWT secret before public deployment.

## Vercel / Render connectivity configuration

The original Render root 404 meant no `/` handler existed; `/api/health` and `/api/auth/status` were already reachable. The deployed Vercel `/api/health` and `/customers` paths returned 404, and Render's CORS header allowed only localhost. The changes below fix those distinct routing/configuration issues without changing authentication or existing business endpoints.

### Existing Render service

Keep the repository root as the service root. Build with `npm ci`, start with `npm run start -w backend`, and set the health check to `/api/health`. Render supplies `PORT`; the app listens on `0.0.0.0`. `render.yaml` is a reviewable blueprint for a new service; the existing service can be updated through its settings instead of creating a duplicate.

Set these in Render's Environment settings before redeploying:

| Variable              | Value                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| NODE_ENV              | `production`                                                                                        |
| FRONTEND_URL          | `https://studio-management-sandy.vercel.app`                                                        |
| TRUST_PROXY_HOPS      | `1` for the direct Vercel-browser → Render API path; review if adding more proxies                  |
| DATABASE_TARGET       | `supabase`                                                                                          |
| SUPABASE_DATABASE_URL | The verified Supabase session-pooler connection string; keep it private                             |
| SUPABASE_CA_CERT      | Full PEM certificate from Supabase Database Settings → SSL Configuration, including BEGIN/END lines |
| DB_SCHEMA             | `studio`                                                                                            |
| JWT_SECRET            | Existing stable production secret, at least 32 characters                                           |
| SETUP_TOKEN           | Only if first-admin setup is still required; at least 24 characters                                 |

`FRONTEND_ORIGIN` remains a supported legacy alias; `FRONTEND_URL` takes precedence. For multiple permitted frontends, use `CORS_ORIGINS=https://one.example,https://two.example` with exact origins, not a wildcard. Requests without an Origin header (health checks and server clients) work normally. Disallowed browser origins receive HTTP 403. OPTIONS preflight permits JSON/Authorization and the existing CRUD methods. PDFs expose Content-Disposition for cross-origin download clients. JWT remains a Bearer token; cookies/credentials mode is not enabled.

Supabase mode accepts `SUPABASE_DATABASE_URL` or, as a fallback, `DATABASE_URL`; it no longer requires a separate local URL. URL SSL query options cannot disable verified TLS. Supply either `SUPABASE_CA_CERT` (multiline PEM, or escaped newlines), `SUPABASE_CA_PATH` (for a Render secret file), or the default bundled local certificate path. Verification stays enabled. Confirm the database name from the Supabase Connect panel; it is commonly `postgres`, and must not be assumed to be `studio_db`. No production schema/data migration is performed by startup.

Both `/` and `/api/health` return `{ "status": "OK", "service": "Studio Management API" }`. `/` is a liveness route; `/api/health` checks PostgreSQL and the required payment ledger schema. Database failure or a missing ledger migration returns sanitized HTTP 503, without a connection string or raw error. Apply approved production migrations before deploying the new backend so Render's readiness check can pass. The existing 404 handler is retained.

### Existing Vercel project

Set `VITE_API_URL=https://studio-management-fv00.onrender.com` for Production (and explicitly selected Preview environments), then redeploy. A trailing `/api` is also accepted and normalized to exactly one `/api`. The value is a public API URL, never a database URL or secret. Vite embeds it during build, so changing it requires a new deployment. Without it, ordinary local development uses `/api` through Vite's proxy. Set `DEV_API_TARGET` only when changing the local API port.

To preserve the instruction to keep `vercel.json` out of Git, the tracked `frontend/scripts/build-vercel.js` emits Vercel Build Output API routing rather than depending on that ignored file. Configure:

| Vercel setting   | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| Root Directory   | `frontend`                                            |
| Framework Preset | `Other` (use the explicit Build Output API artifact)  |
| Install Command  | `npm ci`                                              |
| Build Command    | `npm run build:vercel`                                |
| Output Directory | Leave unset/default; Vercel consumes `.vercel/output` |
| VITE_API_URL     | `https://studio-management-fv00.onrender.com`         |

The build creates `.vercel/output/static` and `config.json` with an API forwarding route, static-asset handling, and an `/index.html` fallback for React Router. Frontend Axios calls go directly to the configured Render URL; the generated proxy also supports deliberate same-origin `/api/*` requests. API paths are processed before the SPA fallback, so backend JSON errors never become an HTML success page. The normal `npm run build` now also emits this routing automatically when Vercel sets `VERCEL=1`; outside Vercel it produces the normal `dist`. The explicit `build:vercel` command remains available. Do not override the generated artifact with a conflicting local `vercel.json`. Vercel build artifacts and all environment files remain ignored.

### Validation and troubleshooting

After redeploying, verify the actual hosted responses:

```powershell
Invoke-RestMethod https://studio-management-fv00.onrender.com/
Invoke-RestMethod https://studio-management-fv00.onrender.com/api/health
Invoke-RestMethod https://studio-management-sandy.vercel.app/api/health
Invoke-WebRequest https://studio-management-sandy.vercel.app/customers -UseBasicParsing
```

Inspect browser Network requests: login/setup/data requests should target `https://studio-management-fv00.onrender.com/api/...`, never `/api/api/...`. OPTIONS should return the exact deployed Vercel origin in Access-Control-Allow-Origin. If root is OK but health is 503, investigate database URL/CA/schema. If CORS still allows localhost, update Render's environment and redeploy. If frontend requests still use the Vercel host accidentally, verify VITE_API_URL was set before the build. If a React Router refresh returns 404, verify Build Output API settings. A Render cold start may take time; the client allows 60 seconds and reports a retryable timeout.

Automated coverage includes API URL normalization, production origin/port/proxy validation, Supabase-only startup settings, root/health/404 responses, allowed and blocked preflight, sanitized database failure, and browser flows using an API on a separate origin. Integration tests require a local `DATABASE_URL` and a test JWT secret, and use disposable schemas. No hosted migration, Git push or cloud redeployment is implied by a successful local test.

## Password recovery, payment reversals, backups and performance

### Administrator password resets

Users includes Reset password for other active accounts. The administrator must confirm their own current password. The API locks both account rows, generates a unique temporary password, revokes existing sessions by incrementing password_version, forces a first-login password change, and records actor/target/time in audit_logs. The temporary password is shown once with no-store caching. Staff cannot reset passwords, and administrators cannot use this route on themselves. Enable a disabled account before resetting it. Endpoint: `POST /api/users/:id/reset-password` with `current_password`.

### Full and partial payment reversals

Migration `002_payment_reversals` adds an append-only `payment_reversals` table and signed `payment_ledger` view. Existing payments are not edited or deleted. Payments → Reverse / history accepts an amount, date, reason and a UUID submission key. The date must be between the original payment date and today's India calendar date. Booking/payment row locks prevent concurrent reversals or new payments from producing inconsistent balances. Total reversals cannot exceed the original amount; identical retries return the original reversal, and mismatched reuse of a key is rejected.

Net receipts are original payments minus reversals. Outstanding balances, invoice paid/balance fields, dashboard, customer history, payment validation and cash reports all use this ledger. A reversal is a cash reduction, not an additional expense. Daily/monthly/yearly receipts can therefore be negative in a period with refunds. Receipt reports include `entry_type` and `payment_id`; negative IDs identify reversal entries. Original receipt PDFs retain their PAY number and original amount, and additionally show reversed amounts/current net totals. Reversal history retains its reason, amount, date and administrator identity. Original invoice snapshots and original payment amounts remain intact.

Endpoints: `GET /api/payments/:id/reversals`, and `POST /api/payments/:id/reversals` with `date`, `amount`, `reason`, `idempotency_key`. Both require admin access. The payment list adds reversed_amount and net_amount while retaining its original amount field.

For local upgrades run `npm run db:migrate -w backend`; the runner backs up first and applies only missing migrations. Fresh installations can use the regenerated `backend/database/install_all.sql` (22 tables plus the ledger view). Existing hosted installations require an approved backup and review of `backend/database/upgrade_002_payment_reversals.sql` before deploying code that uses the ledger. That single-transaction upgrade file refuses an already-applied migration; it has not been executed against Supabase. Do not use the fresh installer on an existing schema.

### Verified backup recovery and scheduling

```powershell
npm run db:verify-backup -w backend
# Preview the daily task without registering it:
powershell -NoProfile -File backend/scripts/install-backup-task.ps1 -Time '03:00'
# Register only after choosing the schedule:
powershell -NoProfile -File backend/scripts/install-backup-task.ps1 -Time '03:00' -Install
Get-ScheduledTaskInfo -TaskName StudioManagementLocalBackup
```

Restore verification creates a new snapshot-consistent backup, checks its checksum, restores it into a uniquely named disposable local database, verifies every application table count and validated constraints, then removes only that test database. It never restores over the source database. The account needs local CREATE DATABASE privileges. The task runs as the signed-in Windows user at the chosen local time, uses the ignored backend/.env, stores no password in its task definition, and does not run while that user is signed out. No task is registered by ordinary application startup. Backups are retained; monitor storage and restrict backup-folder access. Cloud backups need a separate off-machine retention/recovery policy; this local task does not provide that.

### Bundle size and deployment checks

Recharts is loaded only when the dashboard chart is needed. Invoice/equipment pages are separate lazy chunks and keep the existing UI. Shared document/PDF controls are extracted into components/DocumentTools.jsx. The entry bundle dropped from roughly 765 KB to roughly 371 KB; the chart bundle is about 379 KB and loads separately. Numbers are uncompressed and can vary with subsequent builds.

```powershell
npm run verify:deployment -w backend -- --frontend https://studio-management-sandy.vercel.app --backend https://studio-management-fv00.onrender.com
npm run security:git -w backend
```

The deployment checker makes only read-only public requests: root/health, API forwarding, client route refresh, and preflight. The Git audit prints file paths/counts only and exits nonzero if sensitive paths are currently tracked or exist in prior commits; it never prints their contents or modifies history.

The audit found no currently tracked environment files/backups, but six commits still reference historical environment/backup paths. Removing these from shared history requires a coordinated rewrite and updated clones. Before approving that work: preserve a private repository backup, choose the affected branches/tags, rotate any credentials exposed by pushed history, clean an isolated mirror, verify its audit, and review an explicit force-with-lease push plan. No shared history is rewritten or force-pushed by these changes. Production secrets remain managed in Render/Vercel rather than source files.

## Payment receipts with discounts

Bookings now accept Total booking amount, discount type (NONE, PERCENTAGE or FIXED) and discount value. The agreed amount remains the final amount after discount. The backend uses decimal arithmetic with half-up rounding to paise; the frontend uses integer paise for its preview. For example, total 50,000 minus 10% (5,000) gives agreed amount 45,000; previous receipts 5,000 plus current payment 10,000 leave 30,000 due. Discounts above the total, negative amounts and overpayments are rejected. A Final payment must settle the outstanding balance.

Payments ? Save receipt saves one real payment with a unique REC-year sequence number and an immutable receipt snapshot in the same transaction. Advance, Partial and Final are supported alongside legacy payment types; Cash, UPI, Card, Bank transfer and existing Cheque remain supported. Submission keys prevent duplicate payments. Existing PAY numbers stay unchanged. Payment search also accepts receipt numbers.

View receipt, Download PDF and the preview's print action use the saved payment; they never create another payment. The A4 PDF includes studio branding, customer/event/package details, gross/discount/net totals, previous/current payments, balance, amount in words, reference, remarks and an authorized-signatory section. Long content continues on an appendix page. Settings accepts PNG/JPEG logos up to 100 KB and 2048 pixels, with optional tagline, signatory and footer. The default camera mark works without an uploaded logo.

Issued receipts preserve the original booking, customer, studio, logo and financial details. Later reversals appear as current reversal information without rewriting the issued balance. Historical payments lacking a snapshot are reconstructed from available records on first receipt access and clearly labeled; unavailable historical settings cannot be recovered. No separate receipt transaction table is created.

### Migration and API

Migration source: `backend/database/migrations/003_receipt_design.up.sql`; rollback source has the matching `.down.sql` suffix. It extends bookings, payments and studio settings, adds a receipt counter and deduplicated logo assets, and protects issued payment snapshots. Existing bookings get no discount; old payment amounts and numbers are preserved. Rollback refuses to discard receipt/discount/branding data.

The approved migration was tested in disposable local schemas, then applied to the local database after a verified backup. **Supabase has not been migrated.** For an existing hosted installation, review and approve a production backup and migration first. Run `upgrade_002_payment_reversals.sql` if absent, then `backend/database/upgrade_003_receipt_design.sql` against the correct database in the SQL editor. These upgrade files refuse repeat execution. Database selection happens in the connection/SQL editor, while the scripts use the `studio` schema. Use `install_all.sql` only for an empty installation.

Existing authenticated admin routes are reused:

- `POST /api/payments`: saves payment and snapshot; accepts payment_type plus the existing payment fields/idempotency key.
- `GET /api/payments/:id/receipt`: receipt metadata, excluding binary logo bytes.
- `GET /api/payments/:id/receipt/pdf`: saved A4 receipt PDF.
- Existing booking create/update routes accept total_amount, discount_type and discount_value.
- Existing settings GET/PUT routes include receipt branding and logo_data_url.

Readiness `/api/health` checks the ledger and receipt schema; deploy the backend only after the approved migration is applied. It returns sanitized 503 when required database objects are missing.

### Local verification and release

```powershell
npm test -w backend
npm run verify:receipts -w backend
npm run verify -w backend
npm run verify:features -w backend
npm run verify:browser -w backend
npm run build -w frontend
npm run dev
```

Tests use disposable schemas for database/API/browser checks. Receipt coverage includes no/percentage/fixed discount, rounding, advance/partial/final payments, zero balance, invalid values, concurrent numbering, duplicate submissions, immutable snapshots, reversals, historical receipts and PDF output. Browser checks cover receipt preview/download and existing desktop/mobile modules. The fixture PDF is generated locally at ignored `test-results/receipt-reference.pdf`.

Review the complete diff before staging because this workspace also includes the earlier reversal, backup and deployment changes. Suggested commands (not executed):

```powershell
git diff --check
git diff --stat
git add README.md backend frontend shared
git diff --cached --name-only
# Confirm no environment files, backups or vercel.json appear before committing.
git commit -m "Add payment receipts with discounts and preserved receipt details"
git push origin HEAD
```

After explicit production approval: verify a production backup, apply the reviewed upgrades to Supabase, then deploy Render with its existing verified TLS/database/CORS environment. Confirm Render `/api/health` is OK before redeploying Vercel. Keep VITE_API_URL set to the Render origin and use the Vercel build settings above. Smoke-test login, discounted booking, a saved payment and receipt preview/download/print. No Git push, Render/Vercel deployment or production migration was performed for this implementation.

## Settings ? Master Management

Migration `004_master_management` adds exactly two master tables: `master_entity` and `master_entity_value`. Seven entities and 53 default values are seeded, including the 21 requested album types in display order. Existing custom album types/sizes, payment methods, event types, expense categories and equipment categories are imported without changing saved transactional text. Additional imported values can increase the counts. Master entities/values have identity keys, unique generated codes, active status, display order, timestamps and non-cascading foreign keys/indexes.

The implementation lives in `backend/routes/masters.js`, `backend/services/master-values.js`, `shared/master-code.mjs` and `frontend/src/pages/MasterManagement.jsx`. Existing controller/lookups, record/equipment services, validation, Settings/forms and category filters are extended. Installer generation, migration runner and regression scripts include version 004. No additional Markdown documentation was created.

Settings ? Master Management provides summary cards, entity search/selection, add/edit/status actions, searchable and paginated values, active/inactive filtering, display order, read-only generated codes, notifications and responsive tables. Admin writes reuse JWT authentication and audit_logs; staff may read active master entities/values only. There is no permanent-delete API. Concurrent duplicate submissions are rejected by database unique constraints with a meaningful HTTP 409.

### Compatibility and code generation

`shared/master-code.mjs` supplies identical frontend/backend code generation: trim, uppercase, replace separator runs with underscores, trim surrounding underscores, and validate a nonempty code of at most 100 characters. Names may contain up to 150 characters. The backend generates codes itself; PostgreSQL also generates/checks insertion codes and protects saved codes on updates. Names containing no ASCII letters or digits cannot produce a code and return a validation error; no random suffix is appended. Edits preserve codes.

Dropdown integration covers Albums (type/size), Payments (method), Bookings (event), Expenses (category), Equipment (category), and Packages (new optional package_type text field). PAYMENT_TYPE means payment method; the receipt's Advance/Partial/Final purpose remains separate. Workflow statuses, security roles, discount calculation types and expense payment methods retain their existing controlled rules.

Legacy event_types rows/IDs remain as a compatibility bridge for bookings and reports; missing seeded/new event options are added to that existing table. No existing event is renamed or renumbered. Stable stored_value, legacy_aliases and legacy_event_type_id fields in master_entity_value preserve original spellings and IDs. Editing a master display name updates dropdown labels without rewriting transaction history. New records accept active choices only. Editing an existing record may retain its inactive saved choice; switching to another choice requires it to be active. Existing transaction column types and receipt snapshots are preserved. Blank historical package types remain blank. Backend master validation replaces fixed payment/category CHECK lists so administrator-defined choices work; direct SQL writers must use the application services or supply equivalent validation.

### REST API

All routes require JWT authentication. Collection responses use `{ data, total, page, limit }`; the entity collection additionally returns admin summary counts. Singular/write responses return the saved record. Errors use the existing `{ error }` format.

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/api/master/entities` | List / create entities |
| GET / PUT | `/api/master/entities/:id` | Read / edit entity |
| PATCH | `/api/master/entities/:id/status` | Activate/deactivate entity |
| GET / POST | `/api/master/entities/:id/values` | List / create values |
| GET | `/api/master/values?entityCode=ALBUM_TYPE` | Dropdown values |
| PUT | `/api/master/values/:id` | Edit value |
| PATCH | `/api/master/values/:id/status` | Activate/deactivate value |

Writes accept `{ name, description, display_order, is_active }`; entity_name/value_name are also accepted for the corresponding name. Codes are generated, never editable. Status bodies contain `{ is_active: true/false }`. Collection query options: search, status (all/active/inactive), page, limit (1–100), sort (display_order/name/code), direction (asc/desc). Staff always receive effective active choices regardless of status query. Existing `/api/lookups` adds master_values and returns active event dropdown mappings without removing its other fields.

### Migration, verification and deployment

The reviewed SQL is `backend/database/upgrade_004_master_management.sql`, with source `backend/database/migrations/004_master_management.up.sql`. The migration was tested in disposable local schemas, then applied to the local studio database after explicit user approval and a checksum/archive-verified backup. It has NOT been applied to Supabase. Existing transaction counts and event IDs/names are checked by the runner; integration fixtures verify historical album rows remain identical. Repeat runner execution skips applied versions; the standalone upgrade refuses an already-applied version without changing records.

Automatic rollback of master configuration is intentionally refused by the down script. Prefer a forward correction. If a full rollback is required, restore the verified pre-004 backup into a separate database, compare and reconcile transactions created since backup, then review an application/database switch. Do not run destructive SQL or overwrite the current database to remove configured masters.

```powershell
npm test -w backend
npm run verify:masters -w backend
npm run verify -w backend
npm run verify:features -w backend
npm run verify:receipts -w backend
npm run verify:browser -w backend
# From backend, optionally validate the complete fresh-install SQL:
# node scripts/verify-install.js
npm run build -w frontend
```

Tests cover seeds/custom imports, code generation/parity, duplicate/concurrent creation, immutable codes, renamed labels, active/inactive choices, search/order/pagination, admin/staff access, custom album/payment choices, legacy edits, event mappings, audit logs, PDF receipts and application regressions. Browser verification exercises Master Management alongside the existing modules; its ignored screenshot is `test-results/master-management.png`.

For production, first approve and verify a Supabase backup and inspect schema_migrations. Apply only missing upgrades in order 002 ? 003 ? 004 (001 must already exist); never run install_all.sql against an existing schema. Fresh installations now contain 24 tables plus the ledger view. The new backend health check requires the master schema. Deploy Render after the approved migration, confirm `/api/health`, then rebuild Vercel with the existing VITE_API_URL. Keep the repository's `shared/` directory available to both build contexts; do not deploy an isolated frontend/backend folder that omits it. Smoke-test a custom album type, a payment method, an inactive historical record and receipt download. No production migration, Git push or deployment was performed.

## Staff profile details and mobile validation

Migration 005 (`backend/database/upgrade_005_staff_details.sql`) adds DOB, email and address to staff. These fields are required by the API and staff form on create/edit; existing rows retain NULL until their profile is completed. DOB must be a valid calendar date no later than today in India. Staff tables show the new details, and event-assignment lookups retain their prior fields without exposing these additional profile details.

Customer mobile, alternate mobile, staff mobile and studio contact phone now accept exactly 10 ASCII digits when supplied, enforced by backend validation and numeric phone inputs with maxlength/pattern constraints. Customer primary mobile stays required; previously optional contact fields remain optional. Country prefixes, spaces, letters and shorter/longer values are rejected when saving. Existing contact values are not automatically changed.

Migration 005 was applied locally after approval and a verified backup; Supabase remains unchanged. Apply the reviewed upgrade after 004 only after approving a production backup/migration. The fresh installer and migration runner include version 005; rollback refuses to discard populated staff details. Unit tests cover missing/invalid profile fields, future dates, 9/11-digit numbers, letters, country prefixes and optional blank numbers. API/browser checks cover staff save/update and the new form inputs.

## Additional discounts when receiving payments

Payments ? Add payment now includes Additional discount type (NONE/FIXED/PERCENTAGE), Additional discount value, and a live balance preview. The discount applies to the outstanding balance immediately before that payment; percentages use that balance, not the original package price. Example: 35,000 outstanding - 5,000 additional discount - 10,000 received = 20,000 remaining.

The API locks the booking, checks duplicate submission keys, computes the discount with decimal half-up paise rounding, reduces the agreed amount and increases the cumulative booking discount while preserving the gross price. It saves the discount metadata, cash payment, receipt snapshot and audit records in one transaction. Invalid payment methods, overpayments, excessive discounts and failed inserts roll back the discount too. Multiple accumulated discounts are stored as the booking's cumulative fixed discount; each payment preserves its own original type/value/basis/amount. New request fields are payment_discount_type and payment_discount_value; older clients default to NONE/0.

Receipt PDFs display the cumulative discount and the separate payment-time discount with its original outstanding balance. Earlier issued receipts remain immutable. Cash reports include only received money; discounts are not cash receipts or expenses. Reversing a payment refunds cash and restores that amount to the outstanding balance; it does not undo an agreed discount. A Final payment must settle the balance after discount. Zero-cash discount-only entries are not supported by the existing positive-payment workflow.

An issued invoice locks the booking total. Void it through the existing invoice workflow before applying a payment discount, then issue a replacement invoice matching the revised agreed amount. Neither issued invoices nor historical receipts are silently rewritten.

Migration 007 (`backend/database/upgrade_007_payment_discounts.sql`) adds four payment discount metadata fields, consistency checks and an immutability trigger. It was tested in disposable schemas and applied locally after explicit approval and a verified backup. Existing payments default to no additional discount. Supabase remains unchanged; approve a production backup and apply this reviewed upgrade after 006 before deploying the updated backend. Rollback refuses to discard nonzero payment discounts. Run npm test, verify:receipts, verify:features, verify:browser and the frontend build using the workspace commands above.

## Financial logic audit — 14 November 2026

Scope: existing amounts, discounts, refunds/reversals, invoices/receipts, expenses, dashboard, reports, constraints and frontend previews. This was an audit, not a data repair. No application financial formulas, existing records or production data were changed. New tools are `backend/database/financial_audit.sql`, `backend/scripts/audit-financials.js` and `backend/scripts/verify-financial-audit.js` plus their npm scripts. Results are written only to ignored test-results JSON files.

### Confirmed findings

| ID | Severity | Reproduction | Recommended correction |
| --- | --- | --- | --- |
| F01 | High | A booking with 4,980 of issued payment discounts accepts an edit setting its cumulative discount to zero. Those immutable payment discounts remain on payment rows but disappear from the current agreed amount/balance. | Preserve granted payment discounts separately when editing the booking discount; reject cumulative discounts below issued payment discounts unless an explicit correction workflow is approved. Update the form to distinguish booking and cumulative discounts. |
| F02 | High against historical-PDF requirement | Issue an invoice after receiving 100; later receive 200. Downloaded invoice PDF changes paid from 100 to 300 and balance from 900 to 700, using invoiceSelect's live ledger values. Issued subtotal/discount/net stay fixed. | Preserve invoice issue-time paid/balance values for the original document, retain separately labeled current collection status, and handle historical invoices explicitly rather than inventing old snapshots. A schema change would require separate review/approval. |
| F03 | Medium/capacity | Two valid 6,000,000,000 invoices make `/api/feature-summary` return HTTP 400 because its aggregate is cast to NUMERIC(12,2), which cannot exceed 9,999,999,999.99. | Use unconstrained/wider NUMERIC for aggregate totals; retain bounded types on individual records. |

These were reproduced in a disposable local schema, not against existing records. The audit runner distinguishes successful consistency checks from confirmed defects; an exit code 0 for the fixture runner means the audit completed and its reproductions were verified, not that the application has no financial defects.

### Actual financial columns and sources

The inspected database exposes 22 numeric columns, including one ledger-view amount and quantities/percentage values:

| Relation | Numeric columns |
| --- | --- |
| packages | amount |
| bookings | agreed_amount, discount_amount, discount_value, generated total_amount |
| payments | amount, payment_discount_value, payment_discount_amount, payment_discount_basis |
| payment_reversals | amount |
| payment_ledger (view) | amount, signed positive payment / negative reversal |
| invoices | subtotal, discount, tax_amount, total_amount |
| invoice_items | quantity (12,3), unit_price, line_total |
| expenses | amount |
| albums | printing_cost |
| equipment | purchase_cost |
| equipment_maintenance | maintenance_cost |

Stored monetary values use NUMERIC(12,2); discount percentages also use a two-decimal numeric value. Main calculations are in services/booking-pricing.js, services/payment-discount.js, services/records.js, services/payment-reversals.js, services/invoices.js, services/receipt-snapshots.js, services/equipment.js and controllers/api.js. PDFs use services/pdf.js and services/receipt-pdf.js. Frontend previews are in services/booking-pricing.js, App.jsx and components/PaymentDiscountPreview.jsx; invoice entry is in pages/Enhancements.jsx. Decimal/BigInt previews and server PostgreSQL/Decimal calculations use half-up paise rounding; invoice lines are rounded before subtotaling.

### Dependency map

```text
packages.amount -- explicit selection-time copy --> bookings gross (editable custom amount)
bookings gross - cumulative discount ------------> bookings.agreed_amount
payment-time discount -- locked transaction -----> increases cumulative discount / reduces agreed amount
payments.amount - payment_reversals.amount ------> payment_ledger (net cash receipts)
booking agreed amount - net cash ----------------> booking outstanding
invoice_items -- round lines / sum / discount ---> invoice net (must equal booking agreed amount at issue)
invoice snapshots + live ledger -----------------> invoice UI/PDF paid and balance (F02)
booking/customer/studio + saved payment ---------> immutable receipt figures, plus labeled current reversal status
expenses.amount --------------------------------> paid cash outflow
net ledger - paid expenses ----------------------> net cash balance (not earned revenue/accounting profit)
ledger + booking totals -------------------------> dashboard / reports / customer booking history
album printing / equipment purchase / maintenance estimates --> no automatic cash expense
maintenance -- record/link paid expense ---------> expenses, counted once
```

Booking total_amount is generated as agreed_amount + cumulative discount_amount. Cumulative discount includes both the original booking discount and granted payment discounts; the original booking portion can only be inferred as current cumulative discount minus SUM(payment_discount_amount). F01 means that inference can become negative after unsafe edits. Payment discounts reduce the contracted balance, never cash received. Refunds reverse cash and retain discounts. The ledger models all saved offline payments as received; there is no separate gateway/cheque-clearing/success-status workflow. Advance/Partial/Final is a payment purpose, not a mutable settlement status.

Package master price changes do not overwrite saved booking totals. Explicit package reselection loads its current amount; manual/custom gross pricing remains supported. There are no separate package-discount, package-final-price or additional-charge columns. Any additional charges are currently included manually in the booking gross; their separate allocation cannot be reconstructed. Differences from the current package master price are informational, not automatically errors. Invoice validation guarantees matching net totals, but permits different invoice gross/discount presentation if the net agrees; the SQL audit highlights that as information for business-policy review.

### API/report coverage and date semantics

| API / report | Financial basis |
| --- | --- |
| GET /api/bookings, /api/bookings/:id | Saved gross/cumulative discount/net; all-time signed ledger for paid/outstanding |
| POST/PUT /api/bookings | Pricing, paid floor, cancellation guards, invoice lock; F01 applies to edit discount |
| POST /api/payments | Positive amount, balance cap, fixed/percentage discount on current outstanding, exact Final settlement, atomic receipt/audit, submission-key retry |
| GET/POST /api/payments/:id/reversals | Positive bounded refund, payment-date through India-today, retry key and booking/payment locks |
| GET /api/payments/:id/receipt and /pdf | Saved original figures and original payment date; current reversal information is separately labeled |
| GET/POST /api/invoices and GET /api/invoices/:id, /pdf | Issued document net and snapshots; paid/balance from live net booking cash; voided invoices excluded from active totals |
| GET /api/dashboard | All-time net receipts, active-booking outstanding, paid expenses; six monthly buckets use payment/reversal dates and expense dates |
| GET /api/feature-summary | Active invoice totals/outstanding, equipment counts; aggregate-capacity issue F03 |
| GET /api/customers/:id/history | Booking-level totals with net paid/outstanding, not a detailed customer transaction statement |
| reports: receipts, daily, monthly, yearly | Payment dates and reversal dates; refunds can make a period negative |
| reports: expenses, categories | Expense date; general and booking-linked paid expenses both included |
| reports: summary | Cash by payment/reversal/expense date; net cash is not profit |
| reports: bookings, outstanding | Event-date filter, with all-time net receipts for each booking; outstanding excludes cancelled bookings |
| reports: customers | Bookings selected by event date; booked_amount includes recorded cancelled bookings, so it is not the dashboard active-outstanding metric |
| reports: albums | Actual delivery date, otherwise expected delivery date; printing_cost is an estimate, not an expense |

Dashboard pending subtracts all net receipts from active booking values. This reconciles under the existing rule that a cancelled booking has zero net cash; the audit SQL flags any imported/direct-SQL cancelled booking with retained cash. Date boundaries use PostgreSQL date/CURRENT_DATE for charts/overdue status, while reversal validation uses India today. Month/day boundary differences should be aligned if a cloud database session uses a different timezone. Future-dated payments/expenses are accepted by current validation and included in all-time totals; confirm the intended posting-date policy before changing it.

Expenses represent paid outflows only; there are no expense paid/pending/status columns or salary payroll schedules. Equipment purchase_cost, maintenance_cost and album printing_cost are not double-counted as cash. Maintenance creates/links one matching Equipment expense; duplicate linking and edits/deletion of linked expenses are blocked by constraints/triggers. General studio expenses are not treated as booking-specific costs. Tax is explicitly disabled (tax_amount must be zero).

Not implemented: dedicated discount report, package-wise revenue report, earned-revenue/profit-and-loss report, separate expense-payable report, detailed customer ledger statement, and mandatory structured payment-discount reason (remarks are optional). Existing net-cash reporting is not an accounting P&L. No missing reports or duplicate financial modules were created by this audit.

### Reconciliation and evidence

`financial_audit.sql` is a repeatable-read, read-only transaction. It aggregates payments, refunds, payment discounts and booking-linked expenses separately before joining to bookings, preventing one-to-many multiplication. It checks discount composition, ledger/source equality, outstanding/overpayments, cancelled cash, receipt arithmetic, invoice/item totals/rounding, linked-maintenance costs, invalid amounts, duplicate keys, orphans and financial references. Possible duplicate bank references are informational because repeated installment details can be legitimate. It does not compare historical receipt net values with today's booking net, because those snapshots are intentionally historical.

The local source audit found zero violations. Its reconciliation at audit time: gross bookings 100,000; original cash receipts 50,000; reversals 40,000; net receipts 10,000; expenses 0; outstanding 90,000. One existing legacy payment has no receipt snapshot; its first receipt access reconstructs and labels historical details, so exact unavailable original branding/discount history cannot be guaranteed. No receipt was materialized by the read-only audit.

The fixture audit completed 43 consistency checks and reproduced F01/F02/F03. It verified package-price isolation, custom gross, booking/payment discounts, advance/partial/final payments, retries, refunds, invalid zero/negative/overpayments, protected cancellations, cash/report/dashboard/history reconciliation, period grouping, invoice half-up line rounding, invoice total protection, immutable receipt figures and single expense posting. Source table counts and row fingerprints matched before and after fixture execution. Existing records were neither repaired nor rewritten. Results: ignored test-results/financial-audit-local.json and financial-audit-fixtures.json.

```powershell
npm run audit:financial -w backend
npm run verify:financial-audit -w backend
```

The local runner refuses remote/Supabase URLs. The SQL file can be reviewed separately for read-only execution on another database; no cloud audit, migration, deployment, push or financial data repair was performed. Monetary totals in audit JSON are strings to preserve decimal precision. Frontend currency display still converts to Number and the dashboard subtracts cash using Number; values beyond safe cent precision remain an additional scaling risk even though authoritative SQL amounts are exact.
