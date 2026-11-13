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
