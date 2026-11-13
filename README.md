# Photography Studio Management

Local React + Express + PostgreSQL application for one photography studio with multiple users. Includes customers, bookings and staff assignments, offline installment payments with printable receipts, album delivery tracking, expenses, CSV reports, users, packages, staff and studio settings. Light blue responsive interface; all dashboard values come from PostgreSQL.

## Windows setup

Install Node.js 22.12+ and PostgreSQL 16+. Open PowerShell in this directory.

```powershell
npm install
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env`. Set `DATABASE_URL` to your PostgreSQL connection; URL-encode special characters in the password. The application uses database `studio_db` and schema `studio`. The supplied local connection is kept in ignored `backend/.env`; it is not part of the source. For a new installation, connect with pgAdmin or psql and run `CREATE DATABASE studio_db;` first. Use a dedicated database owner for normal deployment rather than a PostgreSQL superuser.

Generate separate random secrets for `JWT_SECRET` and `SETUP_TOKEN` (at least 32 and 24 characters respectively):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run db:init
# Optional packages only, clearly labeled demo data:
npm run db:init -w backend -- --demo
npm run dev
```

Open http://localhost:5173. API runs on http://localhost:4000. The first screen creates an administrator using the local `SETUP_TOKEN`, your name, email and a password of at least 12 characters. No account or credentials are seeded. Setup locks after the first account exists; remove `SETUP_TOKEN` from your environment after setup. Sign in after creating the administrator. Create studio details, packages and staff under Settings; then customers and bookings.

`schema.sql` is idempotent for fresh installation, not a migration mechanism. Schema name is fixed to `studio` in SQL; keep `DB_SCHEMA=studio`. PostgreSQL credentials and both generated secrets must remain private. `.env` is ignored. Session JWTs last 8 hours, are stored in browser session storage and checked against active users on every API request. Use HTTPS and a reverse proxy for any remote deployment. The local server binds to loopback.

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

Payments are append-only receipts. Every submission has a UUID idempotency key, and the booking is locked inside a transaction before validating its outstanding balance. Retrying the same submission returns the original receipt. Overpayments and payments to cancelled bookings are rejected. Agreed amounts cannot be lowered below receipts; bookings with receipts cannot be cancelled. There is no refund or payment correction workflow in this version. Amounts use PostgreSQL `NUMERIC(12,2)` and validation allows two decimal places. Printing cost on an album is an estimate; enter the actual paid cost once under Expenses. Booking advances are entered once through Payments. Net cash balance means receipts minus expenses paid, not accounting profit.

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

`npm run db:backup -w backend` takes a full custom-format dump and row-count manifest in ignored `backups/`. PostgreSQL 18 Windows tools are detected at the standard install location; override `PG_DUMP_PATH` if needed. Keep backups private because they contain business data and password hashes. `npm run db:rollback -w backend` takes another backup and removes only this migration when all feature tables are empty; it refuses rollback if feature records exist. It does not drop existing core tables. Never bypass this guard to remove live feature data. Production migration requires explicit `--approve-production` in addition to the actual operator approval.

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

`npm run start:supabase -w backend` explicitly selects the prepared Supabase connection and a pool of five clients while preserving the local default. It requires the CA certificate and a migrated target schema. It does not initialize or migrate the hosted database. Use a dedicated runtime role and separate production JWT secret before public deployment. The current loopback-bound development server configuration is not a Render deployment configuration; cloud hosting preparation remains a separate stage.
