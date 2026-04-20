# ExpressJS API Boilerplate

A production-ready modular **Express.js** REST API boilerplate. Packed with JWT authentication, background email queuing (BullMQ), Prisma ORM (PostgreSQL), Redis, and multiple security layers.

---

## Tech Stack

| Category      | Library                                        |
| ------------- | ---------------------------------------------- |
| Framework     | Express.js v5                                  |
| Database      | PostgreSQL + Prisma ORM                        |
| Cache / Queue | Redis + BullMQ                                 |
| Auth          | JWT (access & refresh token)                   |
| Email         | Nodemailer (SMTP)                              |
| Validation    | Zod                                            |
| Security      | Helmet, CORS, HPP, XSS sanitizer, Rate Limiter |
| Logging       | Winston + Morgan                               |
| Scheduler     | node-cron                                      |

---

## Project Structure

```
src/
├── app.js              # Express setup, middleware, routes
├── server.js           # Entry point, graceful shutdown
├── config/             # Database, redis, cors, helmet, logger config
├── email/              # Mailer + email templates (base, verify, reset-password)
├── jobs/
│   ├── queues/         # BullMQ queue definitions (email queue)
│   ├── workers/        # BullMQ workers for processing queues
│   ├── cron/           # Scheduled jobs (node-cron)
│   └── run-workers.js  # Worker entry point (runs as a separate process)
├── middleware/         # Auth, error handler, validation, rate limit, XSS
├── modules/
│   ├── auth/           # Register, login, logout, refresh token, verify email, reset password
│   ├── user/           # User CRUD (protected)
│   ├── profile/        # Logged-in user profile
│   └── health/         # Health check endpoint
├── routes/             # Route aggregator (/api/v1/)
├── services/           # Email service
└── utils/              # AppError, JWT helper, token helper
prisma/
├── schema.prisma       # Model definitions (User, RefreshToken, EmailVerificationToken, PasswordResetToken)
├── seed.js             # Initial data (admin user)
└── migrations/         # SQL migration files
```

### Request Flow

```
Client
  └─► Express (app.js)
        ├─ Global Middleware (helmet, cors, hpp, xss, rate limiter, morgan)
        └─ /api/v1/
              ├─ /auth      → auth.route → auth.controller → auth.service → auth.repository → Prisma
              ├─ /users     → user.route → user.controller → user.service → user.repository → Prisma
              ├─ /profile   → profile.route → ...
              └─ /health    → health.route → ...

Background (run-workers.js)
  └─► BullMQ Worker
        └─ email.worker → email.service → Nodemailer (SMTP)
```

---

## Prerequisites

Make sure the following are installed on your system:

- [Node.js](https://nodejs.org/) >= 18
- [PostgreSQL](https://www.postgresql.org/) >= 14
- [Redis](https://redis.io/) >= 6

---

## Installation

### 1. Clone & install dependencies

```bash
git clone <repository-url>
cd express-core
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then fill in the appropriate values in your `.env` file:

```env
APP_NAME="App Name"
APP_URL=http://localhost:
NODE_ENV=development
PORT=3000

# Comma-separated list of allowed origins for CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

FORMLIMIT=52428800
ENABLELOG=true

# PostgreSQL Database
DATABASE_URL="postgresql://user:password@localhost:5432/your_database?schema=public"

# JWT — generate secret with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=replace_with_a_secure_random_string
JWT_ACCESS_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
BCRYPT_ROUNDS=10

# SMTP Mail
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM="App Name <noreply@example.com>"

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 3. Create storage directory

```bash
mkdir -p client/storage/public
```

---

## Database Migration

### Run migrations (development)

```bash
npx prisma migrate dev
```

This will create all database tables based on `prisma/schema.prisma` and generate a new migration file if there are schema changes.

### Run migrations (production)

```bash
npx prisma migrate deploy
```

### Generate Prisma Client (if needed manually)

```bash
npx prisma generate
```

---

### Making Changes to the Schema

If you want to modify the database structure (add a table, add/remove a column, change a field type, etc.), follow these steps:

**1. Edit `prisma/schema.prisma`**

Open the file and make your desired changes. For example, adding a new field to the `User` model:

```prisma
model User {
  // ...existing fields...
  phone String? // <-- new field
}
```

**2. Create a new migration**

Run the following command and provide a descriptive name for the migration:

```bash
npx prisma migrate dev --name your_migration_name
```

Example:

```bash
npx prisma migrate dev --name add_phone_to_users
```

This command will:

- Generate a new SQL migration file inside `prisma/migrations/`
- Apply the migration to your development database
- Regenerate the Prisma Client automatically

**3. Verify the migration**

Check that a new folder was created under `prisma/migrations/` containing the generated SQL file. You can inspect it to confirm the changes are correct.

**4. Apply to production**

Once your changes are ready, deploy the migration to production:

```bash
npx prisma migrate deploy
```

> **Note:** Never manually edit files inside `prisma/migrations/`. Always use Prisma CLI commands to manage schema changes.

---

## Database Seeding

The seed will create an initial **admin** user:

| Field    | Value           |
| -------- | --------------- |
| Email    | admin@admin.com |
| Password | password        |

Run the following command:

```bash
npx prisma db seed
```

---

## Running the Project

### Development Mode

Runs the Express server and BullMQ worker simultaneously with auto-reload (nodemon):

```bash
npm run dev
```

### Production Mode

In production, both the API server and BullMQ workers must run as separate processes. Use the included PM2 ecosystem config:

```bash
pm2 start ecosystem.config.js --env production
```

To reload without downtime after a deployment:

```bash
pm2 reload ecosystem.config.js --env production
```

> **Note:** The API server runs in `cluster` mode (utilizes all CPU cores) and the worker runs in `fork` mode (BullMQ concurrency handles parallelism internally).

---

## API Endpoints

Base URL: `http://localhost:3000/api/v1`

### Auth

| Method | Endpoint                       | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| POST   | `/auth/register`               | Register a new user                   |
| POST   | `/auth/login`                  | Login, returns access & refresh token |
| POST   | `/auth/logout`                 | Logout (requires authentication)      |
| POST   | `/auth/refresh`                | Renew access token via refresh cookie |
| GET    | `/auth/verify-email`           | Verify email via token                |
| POST   | `/auth/request-password-reset` | Send password reset email             |
| POST   | `/auth/reset-password`         | Reset password with token             |

### User _(requires authentication + permission)_

| Method | Endpoint       | Description       |
| ------ | -------------- | ----------------- |
| GET    | `/users`       | List all users    |
| GET    | `/users/:slug` | Get user by slug  |
| POST   | `/users`       | Create a new user |
| PUT    | `/users/:slug` | Update a user     |
| DELETE | `/users/:slug` | Delete a user     |

### Profile _(requires authentication)_

| Method | Endpoint   | Description                         |
| ------ | ---------- | ----------------------------------- |
| GET    | `/profile` | Get the logged-in user's profile    |
| PUT    | `/profile` | Update the logged-in user's profile |

### Health

| Method | Endpoint  | Description         |
| ------ | --------- | ------------------- |
| GET    | `/health` | Check server status |

---

## Lint

```bash
npm run lint
```

---

## License

Copyright &copy; 2026 - Present Alfian Andre Ramadhan. All rights reserved.
