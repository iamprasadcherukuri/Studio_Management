# Prompt: Deploy Photography Studio Management System Using Free Cloud Hosting

I have a Photography Studio Management System developed using:

- **Frontend:** React.js + Vite
- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL
- **Development Environment:** Windows + VS Code
- **Version Control:** GitHub

## Objective

Deploy my complete application to the cloud without purchasing or managing a virtual machine (VM), VPS, or physical server. Use free-tier cloud hosting services suitable for development, testing, and demonstration.

## Hosting Architecture

- React Frontend → Vercel
- Node.js Backend → Render
- PostgreSQL Database → Supabase
- Source Code → GitHub
- Photo Storage → Cloudinary or Supabase Storage

## Requirements

### 1. Project Analysis

First, analyze my existing project structure:

- Identify frontend and backend directories.
- Review `package.json` files.
- Identify environment variables.
- Review PostgreSQL connection configuration.
- Identify all existing API endpoints.
- Check authentication and authorization.
- Identify database migration and initialization scripts.
- Do not modify existing business logic unnecessarily.

### 2. PostgreSQL Deployment

Provide step-by-step instructions to:

- Create a free Supabase project.
- Configure PostgreSQL.
- Migrate my existing local database schema and data.
- Configure database connection pooling.
- Enable secure SSL connections.
- Validate database connectivity.
- Configure database backups and recovery options.
- Avoid exposing database credentials.

### 3. Node.js Backend Deployment

Prepare my backend for Render hosting:

- Configure dynamic `PORT`, `DATABASE_URL`, `NODE_ENV`, and `FRONTEND_URL`.
- Configure CORS securely.
- Create a `/api/health` endpoint.
- Implement proper error handling.
- Configure PostgreSQL connection pooling.
- Add environment variable validation.
- Configure production logging.
- Ensure the backend works without local filesystem persistence.

Provide the required code changes and deployment settings.

### 4. React Frontend Deployment

Prepare my React application for Vercel:

- Configure `VITE_API_URL`.
- Remove hardcoded localhost API URLs.
- Configure production builds.
- Support React Router refresh.
- Configure API error handling.
- Ensure responsive layouts.
- Connect the frontend to the deployed backend.

### 5. GitHub Configuration

Guide me through:

- Creating a GitHub repository.
- Configuring `.gitignore`.
- Excluding `.env` and secrets.
- Uploading my project.
- Connecting GitHub to Render and Vercel.
- Enabling automatic deployment after pushing code.

### 6. Application Modules

Ensure the following existing modules work after deployment:

1. Dashboard
2. Customer Management
3. Photography Bookings
4. Photography Packages
5. Employees and Salaries
6. Expenses (Equipment, Printing, Travel, Salaries)
7. Invoices and Billing
8. Payment Tracking
9. Photography Delivery Tracking
10. Reports and Analytics
11. Login and User Management

Do not invent missing modules. Identify any modules that are not yet implemented.

### 7. Security

Implement or verify:

- HTTPS
- Secure authentication
- Password hashing
- Role-based authorization
- PostgreSQL parameterized queries
- Environment variable protection
- API input validation
- Secure CORS configuration
- Safe photo uploads
- No database credentials in frontend code

### 8. Deployment Validation

Provide testing steps for:

- Frontend availability
- Backend availability
- PostgreSQL connectivity
- Login authentication
- Customer creation
- Booking creation
- Invoice generation
- Payment recording
- Expense management
- Employee salary records
- Database insert, update, delete, and select operations
- File upload and retrieval

### 9. Free Hosting Limitations

Explain:

- Free-tier resource limits
- Render backend sleep behavior
- Supabase database inactivity restrictions
- Storage limitations
- Backup limitations
- Commercial-use restrictions, especially Vercel Hobby
- When a paid plan becomes necessary

Do not assume that free plans support commercial production hosting.

### 10. Final Deliverables

Provide:

1. Recommended deployment architecture
2. Required configuration changes
3. Environment variable templates
4. PostgreSQL migration instructions
5. Render deployment configuration
6. Vercel deployment configuration
7. GitHub deployment commands
8. Complete deployment checklist
9. Troubleshooting guide
10. Estimated monthly hosting costs in INR

## Important Instructions

- First inspect my existing codebase before suggesting modifications.
- Preserve my existing React UI, backend APIs, PostgreSQL schema, and business logic.
- Explain each step for Windows and VS Code.
- Provide exact commands and configuration examples.
- Do not hardcode passwords, API keys, or connection strings.
- Do not create or modify project files without my explicit approval.
- Show proposed code changes directly in chat before applying them.
- Prefer free services where practical.
- Do not require Docker, Kubernetes, a VM, or a physical server.
- Follow production security best practices.
- Guide me step by step, completing one deployment stage before proceeding to the next.

**Start by reviewing my project structure and preparing a deployment readiness checklist.**
