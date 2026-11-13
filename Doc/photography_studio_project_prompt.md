# Photography Studio Management System — Development Prompt

Act as a senior full-stack developer, PostgreSQL database architect, and UI/UX designer. Build a simple, complete Photography Studio Management System for a **single studio with multiple users**.

## Technology
- Frontend: React, Vite, Tailwind CSS, React Router, Axios
- Backend: Node.js, Express.js, REST APIs
- Database: PostgreSQL
- Authentication: JWT and bcrypt, role-based authorization
- Currency: INR (₹)
- Payments: offline recording only; no payment gateway

## Design
Use a clean **light blue and white theme** with a pale sidebar, white rounded cards, subtle shadows, clear forms and tables, and responsive layouts. Keep the interface simple and consistent. Sidebar: Dashboard, Customers, Bookings, Payments, Albums, Expenses, Reports, Users, Settings.

## Modules

### Dashboard
Show total customers, bookings, payments received, pending payments, expenses, cash balance, pending albums, and upcoming events. Include monthly revenue-versus-expenses chart, recent bookings, and album delivery status. All metrics must come from PostgreSQL.

### Customers
Create, view, edit, search, and safely delete customers. Fields: generated customer ID, name, mobile, alternate mobile, email, address, created date. Show booking history.

### Bookings
Create and manage bookings with customer, event type (wedding, engagement, birthday, pre-wedding, other), event date, location, package, agreed amount, notes, and status (confirmed, in progress, completed, cancelled). Allow staff assignment and link payments and albums. Record advances through the Payments module to avoid duplicate accounting.

### Payments
Record offline cash, UPI, bank transfer, or cheque payments. Fields: booking, date, amount, method, reference, remarks. Support installments, payment history, and printable receipts. Calculate outstanding amount as booking total minus payments received. Validate amounts and prevent duplicate submissions.

### Albums
Track album type, size, pages, printing cost, expected and actual delivery dates, and notes. Workflow: Pending → Photo Selection → Editing → Design → Customer Approval → Printing → Ready for Delivery → Delivered. Record delivery acknowledgement.

### Expenses
Categories: Salaries, Equipment, Printing, Travel, Other. Fields: date, category, description, amount, payment method, optional booking, remarks. Support create, edit, delete, filtering, monthly summaries, and category totals.

### Reports
Daily/monthly/yearly receipts, bookings, outstanding balances, expenses, album deliveries, customer history, and cash-based financial summary. Define **net cash balance = payments received − expenses paid**, not accounting profit. Support date filters and CSV export.

### Users and Settings
Admin has full access; staff has only permitted access. Secure login, hashed passwords, backend permission checks, studio name and contact settings. Provide a secure first-admin setup flow.

## PostgreSQL Schema
Create normalized tables: `roles`, `users`, `customers`, `event_types`, `packages`, `staff`, `bookings`, `booking_staff`, `payments`, `albums`, `expenses`, `audit_logs`, `studio_settings`.

Use primary/foreign keys, unique constraints, `NOT NULL`, `CHECK`, `NUMERIC(12,2)` for money, timestamps, appropriate indexes, parameterized queries, and transactions for financial writes. Provide `schema.sql` and `seed.sql` with clearly labeled demo data.

## Backend
Organize Express code into configuration, routes, controllers, services, middleware, and database modules. Implement CRUD APIs, JWT login, role checks, validation, consistent errors, pagination, filtering, PostgreSQL connection pooling, `.env.example`, and API documentation in README.

## Frontend
Implement working pages and forms for all modules. Include loading, empty, success, and error states. Use protected routes, accessible controls, responsive tables, and reusable components. Do not use hardcoded dashboard data in the finished application.

## Suggested Structure
```text
photography-studio-management/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── services/
│   │   ├── context/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── routes/
│   ├── middleware/
│   ├── services/
│   ├── database/
│   │   ├── schema.sql
│   │   └── seed.sql
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── README.md
```

## Delivery and Quality Requirements
1. Create actual project files in the workspace, not just code snippets.
2. Implement and verify one module at a time.
3. Include Windows setup instructions, PostgreSQL configuration, commands to install dependencies, and how to start frontend/backend.
4. Provide test steps for login, customers, bookings, payments, albums, expenses, and reports.
5. Never hardcode credentials or JWT secrets.
6. Do not add an online payment gateway or unnecessary complexity.
7. Do not claim a build or test passed unless it was actually executed.
8. Do not create extra Markdown documents beyond the project README.

**Start with project structure, PostgreSQL schema, backend APIs, and the light-theme frontend layout. Continue through all modules until the application is runnable locally on Windows.**
