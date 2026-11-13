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
git add README.md backend frontend
git diff --cached --name-only
# Confirm no environment files, backups or vercel.json appear before committing.
git commit -m "Add payment receipts with discounts and preserved receipt details"
git push origin HEAD
```

After explicit production approval: verify a production backup, apply the reviewed upgrades to Supabase, then deploy Render with its existing verified TLS/database/CORS environment. Confirm Render `/api/health` is OK before redeploying Vercel. Keep VITE_API_URL set to the Render origin and use the Vercel build settings above. Smoke-test login, discounted booking, a saved payment and receipt preview/download/print. No Git push, Render/Vercel deployment or production migration was performed for this implementation.
