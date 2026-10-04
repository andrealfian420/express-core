# ExpressJS API Boilerplate

A production-ready, modular **Express.js v5 + TypeScript** REST API boilerplate. Includes JWT authentication, RBAC (Role-Based Access Control), background email queuing via BullMQ, Prisma ORM (PostgreSQL), Redis caching, file uploads, activity logging, and multiple security layers.

---

## Tech Stack

| Category        | Library / Tool                                              |
| --------------- | ----------------------------------------------------------- |
| Language        | TypeScript                                                  |
| Framework       | Express.js v5                                               |
| Database        | PostgreSQL + Prisma ORM v5 (with soft delete extension)     |
| Cache / Queue   | Redis (ioredis) + BullMQ                                    |
| Auth            | JWT (access token + HTTP-only refresh token cookie)         |
| Authorization   | RBAC with Redis-cached role permissions                     |
| Email           | Nodemailer (SMTP) via transactional outbox → BullMQ, dead-letter store |
| Validation      | Zod v4                                                      |
| File Upload     | Multer (local disk, crypto-named files)                     |
| Security        | Helmet, CORS, HPP, XSS sanitizer, Redis-backed Rate Limiter |
| Logging         | Winston (JSON stdout in production, optional files) + Morgan |
| Scheduler       | node-cron in the worker process only                        |
| Process Manager | PM2 or Docker Compose                                       |

---

## Project Structure

```
express-core/
├── ecosystem.config.js         # PM2 process config (api + worker)
├── tsconfig.json
├── prisma/
│   ├── schema.prisma           # DB models: Role, User, RefreshToken, EmailVerificationToken, PasswordResetToken, ActivityLog, Outbox, DeadLetterJob
│   ├── seed.js                 # Seeds initial admin user & role
│   └── migrations/             # Prisma SQL migration history
├── client/
│   └── storage/
│       ├── logs/               # Winston log files
│       └── public/
│           └── uploads/        # Uploaded files (avatars, etc.)
└── src/
    ├── app.ts                  # Express app setup: middleware stack, routes, error handler
    ├── server.ts               # API entry point: HTTP server and graceful shutdown (no cron)
    ├── config/
    │   ├── cors.ts             # CORS policy (disallowed origins rejected with 403)
    │   ├── database.ts         # Prisma client with soft-delete extension
    │   ├── env.ts              # Loads .env and validates all configuration (typed `env`)
    │   ├── helmet.ts           # Helmet security policy config
    │   ├── log.ts              # Morgan log format
    │   ├── logger.ts           # Winston logger (stdout; files only with LOG_TO_FILES)
    │   ├── origins.ts          # ALLOWED_ORIGINS allowlist shared by CORS and the origin guard
    │   ├── redis.ts            # ioredis client
    │   └── storage.ts          # Storage root (STORAGE_ROOT) for uploads and /storage
    ├── email/
    │   ├── mailer.ts           # Mail transport (SMTP) + permanent/transient failure classification
    │   └── templates/          # HTML email templates (verify, reset-password, success-verify)
    ├── jobs/
    │   ├── run-workers.ts      # Worker process entry point: workers, outbox relay, cron schedules, shutdown
    │   ├── config/
    │   │   ├── queue.config.ts    # BullMQ default job options
    │   │   └── queue.constants.ts # Queue and job name constants
    │   ├── queues/
    │   │   ├── email.queue.ts  # BullMQ email queue
    │   │   └── system.queue.ts # BullMQ system queue
    │   ├── relay/
    │   │   └── outbox-relay.ts    # Publishes outbox intents to BullMQ (lease, retry, dead-letter)
    │   ├── workers/
    │   │   ├── email.processor.ts # Email job handler (links, sent marker, permanent failures)
    │   │   ├── email.worker.ts    # BullMQ worker running the email processor
    │   │   ├── system.processor.ts # Maintenance job handler (token cleanup, retention)
    │   │   ├── system.worker.ts
    │   │   └── worker-logging.ts  # Job lifecycle logs + dead-lettering of final failures
    │   └── cron/               # node-cron schedules (time-slot job ids), started by the worker
    ├── middleware/
    │   ├── auth.middleware.ts       # JWT Bearer token validation
    │   ├── error.middleware.ts      # Global error handler
    │   ├── http-log.middleware.ts   # Morgan request lines through the Winston logger
    │   ├── origin-check.middleware.ts # Origin/Referer guard for cookie auth endpoints
    │   ├── rate-limit.middleware.ts # Redis-backed rate limiters
    │   ├── rbac.middleware.ts       # RBAC permission check (Redis-cached)
    │   ├── upload.middleware.ts     # Multer file upload factory
    │   ├── validate.middleware.ts   # Zod request validation
    │   └── xss.middleware.ts        # XSS sanitizer for req.body / req.query
    ├── modules/
    │   ├── auth/           # register, login, logout, refresh, verify-email, password-reset
    │   ├── user/           # User CRUD (auth + RBAC + avatar upload) + client-safe serializer
    │   ├── profile/        # Logged-in user profile (auth + avatar upload)
    │   ├── role/           # Role CRUD + access list (auth + RBAC)
    │   ├── activity-log/   # Audit trail viewer (auth + RBAC)
    │   ├── outbox/         # Transactional outbox repository (intents, claims, retention)
    │   ├── dead-letter/    # Dead-letter store + audited once-only re-drive
    │   ├── health/         # Health check endpoint
    │   └── helper/         # Utility endpoints (role-options dropdown, etc.)
    ├── routes/
    │   └── index.ts        # Route aggregator under /api/v1/
    ├── scripts/
    │   └── redrive-dlq.ts  # Operator CLI: re-drive one dead-lettered job
    ├── services/
    │   ├── cache.service.ts   # Redis get/set/del/sadd/smembers wrapper
    │   ├── email.service.ts   # Email rendering + sendMail (verify, reset, success)
    │   ├── storage.service.ts # File deletion helper
    │   └── system.service.ts
    ├── types/
    │   ├── express.d.ts    # Express Request type extension (req.user, req.role)
    │   └── prisma.ts       # Prisma type helpers
    └── utils/
        ├── appError.ts     # Operational error class
        ├── graceful-shutdown.ts # Ordered shutdown + signal handlers for API and worker
        ├── jwt.ts          # JWT sign / verify helpers
        ├── paginator.ts    # Laravel-style Prisma paginator
        ├── response.ts     # Standardized JSON response helper
        ├── sluggable.ts    # Slug generator
        ├── token.ts        # Opaque token generator
        └── url.ts          # Absolute links under APP_URL (email links)
```

---

## Architecture Overview

### Request Flow

```
Client
  └─► Express (app.ts)
        ├─ Global Middleware
        │    compression · cors · helmet · urlencoded/json · hpp · cookieParser · xss · morgan
        └─ /api/v1/
              ├─ /auth           (auth-specific rate limiters · checkOrigin on login/refresh/logout)
              │    └─ auth.route → auth.controller → auth.service → auth.repository → Prisma
              │                                                   └─ outbox row (same transaction; no Redis on the request path)
              ├─ /users          (apiRateLimiter · authMiddleware · checkPermission)
              │    └─ user.route → user.controller → user.service → user.repository → Prisma
              ├─ /profile        (apiRateLimiter · authMiddleware)
              ├─ /roles          (apiRateLimiter · authMiddleware · checkPermission)
              ├─ /activity-logs  (apiRateLimiter · authMiddleware · checkPermission)
              ├─ /utils          (apiRateLimiter · authMiddleware)
              └─ /health

Background Process (run-workers.ts — single instance, owns all schedules)
  ├─► Outbox relay (every OUTBOX_RELAY_INTERVAL_MS) → claim PENDING rows (lease, SKIP LOCKED)
  │     → queue.add(name, payload, { jobId: 'outbox-<id>' }) → PUBLISHED | retry with backoff | dead letter
  ├─► BullMQ email worker (concurrency: 5)
  │     ├─ sendVerificationEmail
  │     ├─ sendResetPasswordEmail
  │     └─ sendVerificationSuccessEmail      (final failures → dead_letter_jobs)
  ├─► node-cron '0 * * * *' → cleanupExpiredTokens   (jobId: '<name>-<UTC hour>')
  └─► node-cron '0 0 * * *' → cleanupOutbox, cleanupDeadLetterJobs   (jobId: '<name>-<UTC day>')
        └─ system.worker → system.service
```

### Database Models

| Model                    | Key Fields                                                                          | Notes                         |
| ------------------------ | ----------------------------------------------------------------------------------- | ----------------------------- |
| `Role`                   | `slug`, `title`, `userType`, `access` (JSON array), `deletedAt`                     | Soft delete, RBAC permissions |
| `User`                   | `slug`, `email`, `password`, `avatar`, `roleId`, `isEmailVerified`, `deletedAt`     | Soft delete, belongs to Role  |
| `RefreshToken`           | `token` (UUID), `userId`, `expiresAt`                                               | Cascades on user delete       |
| `EmailVerificationToken` | `token` (UUID), `userId`, `expiresAt`                                               | Cascades on user delete       |
| `PasswordResetToken`     | `token` (UUID), `userId`, `expiresAt`, `usedAt`                                     | Cascades on user delete       |
| `ActivityLog`            | `userId`, `action`, `description`, `subjectType`, `subjectId`, `oldData`, `newData` | Audit trail                   |
| `Outbox`                 | `queueName`, `jobName`, `payload`, `status`, `attempts`, `availableAt`             | Email/job intents; pruned     |
| `DeadLetterJob`          | `queueName`, `jobName`, `jobId`, `payload`, `failedReason`, `redrivenAt`           | Final failures; pruned        |

### RBAC System

Permissions are stored as a JSON array in the `Role.access` column (e.g., `["module.master-data.user.index", "module.master-data.user.create"]`).

The `checkPermission(permission)` middleware:

1. Reads the user ID from `req.user.sub` (set by `authMiddleware`)
2. Looks up the user's role from Redis cache (`user-role:{userId}`, TTL 5 min)
3. Falls back to Prisma if cache miss, then caches the result
4. Checks if the required permission string exists in `role.access`
5. Returns `403` if the permission is not granted

Available permission keys are defined in [src/modules/role/role.permissions.ts](src/modules/role/role.permissions.ts).

### Rate Limiting

All rate limiters are backed by **Redis** — safe for clustered/multi-instance deployments.

| Limiter                | Window | Max Requests |
| ---------------------- | ------ | ------------ |
| API (general)          | 15 min | 1000         |
| Auth (general)         | 15 min | 50           |
| Login                  | 15 min | 10           |
| Register               | 1 hour | 20           |
| Request password reset | 15 min | 5            |
| Reset password         | 15 min | 10           |

### Standard Response Format

```json
{
  "success": true,
  "message": "OK",
  "data": {}
}
```

On error:

```json
{
  "success": false,
  "message": "Error description",
  "data": null
}
```

### Pagination (Laravel-style)

List endpoints support query parameters: `page`, `per_page`, `sort`, `order`, `search`.

Response includes a `meta` object (total, per_page, current_page, last_page, from, to) and a `links` array (first, last, next, prev page URLs).

---

## Prerequisites

Make sure the following are installed on your system:

- [Node.js](https://nodejs.org/) >= 18
- [PostgreSQL](https://www.postgresql.org/) >= 14 (or use Docker)
- [Redis](https://redis.io/) >= 6 (or use Docker)
- [Docker](https://www.docker.com/) & Docker Compose (optional, for containerized setup)

---

## Installation

### Option A: Docker (Recommended for teams)

Full containerized development with hot-reload — no need to install Node, PostgreSQL, or Redis on your host machine.

#### 1. Clone the repository

```bash
git clone <repository-url>
cd express-core
```

#### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (JWT secret, SMTP credentials, database credentials, etc.). This single file is used for both Docker Compose variable substitution and app configuration inside containers.

#### 3. Start development environment

```bash
make dev
```

This will:

- Build the Docker images
- Start PostgreSQL (PostGIS) + Redis containers (with authentication)
- Run Prisma migrations automatically
- Start the API server and BullMQ worker with hot-reload (`ts-node-dev --poll`)

The API will be available at `http://localhost:3001` (or whatever `PORT` is set to).

> **Note:** `--poll` is required for hot-reload to work when the project is on a Windows filesystem. See [DOCKER_IMPLEMENTATION.md](DOCKER_IMPLEMENTATION.md) for details.

#### 4. Run database seed

```bash
make seed
```

#### Available Make commands

| Command        | Description                                      |
| -------------- | ------------------------------------------------ |
| `make dev`     | Start full Docker dev environment (hot-reload)   |
| `make prod`    | Start production-like environment                |
| `make build`   | Build Docker images only                         |
| `make migrate` | Run Prisma migrations (dev mode)                 |
| `make seed`    | Run database seeder                              |
| `make redrive id=… by=…` | Re-drive one dead-lettered job (once)  |
| `make logs`    | Tail all container logs                          |
| `make shell`   | Shell into the API container                     |
| `make studio`  | Open Prisma Studio                               |
| `make down`    | Stop all containers                              |
| `make clean`   | Stop containers and remove volumes (fresh start) |
| `make test`    | Full isolated test suite with coverage (see [Testing](#testing)) |

---

### Option B: Manual (Native)

#### 1. Clone & install dependencies

```bash
git clone <repository-url>
cd express-core
npm install
```

#### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in the appropriate values (adjust `REDIS_HOST` and `DATABASE_URL` for local development).
Variables already set in the real environment take precedence over `.env`. At startup
`src/config/env.ts` validates the configuration and stops with a list of the invalid keys
(for example a missing `DATABASE_URL`, `ENABLELOG=maybe` or a `JWT_ACCESS_EXPIRES` without a
unit); in production it also rejects the example JWT secret and secrets shorter than 32 characters.

```env
APP_NAME="App Name"
APP_URL=http://localhost:3001
NODE_ENV=development
PORT=3001

# Comma-separated list of allowed origins for CORS
ALLOWED_ORIGINS=http://localhost:3001,http://localhost:5173

FORMLIMIT=52428800
ENABLELOG=true      # log /api/v1 requests (true/false)
LOG_TO_FILES=false  # also write client/storage/logs/*.log

# PostgreSQL (use localhost for local dev, not "postgres")
DATABASE_URL="postgresql://user:password@localhost:5432/your_database?schema=public"

# JWT — generate secrets with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_ACCESS_SECRET=replace_with_a_secure_random_string
JWT_ACCESS_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
BCRYPT_ROUNDS=10
# Required: client page that receives ?token=… from the password-reset email
PASSWORD_RESET_URL=http://localhost:5173/reset-password

# SMTP Mail
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM="App Name <noreply@example.com>"

# Redis (use 127.0.0.1 for local dev, not "redis")
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

#### 3. Create storage directories

```bash
mkdir -p client/storage/logs client/storage/public/uploads
```

---

## Database

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

Check that a new folder was created under `prisma/migrations/` containing the generated SQL file.

**4. Apply to production**

```bash
npx prisma migrate deploy
```

> **Note:** Never manually edit files inside `prisma/migrations/`. Always use Prisma CLI commands to manage schema changes.

---

## Database Seeding

The seed script creates an initial **Super Administrator** role and **admin** user:

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@admin.com` |
| Password | `password`        |

### Development

Compiles TypeScript first, then runs the seed script via Node:

```bash
npm run seed
```

> This runs `tsc && node prisma/seed.js` — imports are resolved from the compiled `dist/` output.

### Production

```bash
npx prisma db seed
```

> Uses the `prisma.seed` entry in `package.json` (`node ./prisma/seed.js`). Make sure `dist/` is up to date before seeding in production.

---

## Running the Project

### Development

**With Docker (recommended):**

```bash
make dev
```

**Without Docker (native):**

Runs the API server and BullMQ worker in parallel with auto-reload:

```bash
npm run dev
```

### Build

```bash
npm run build
```

Output goes to `dist/`.

### Production

**With Docker:**

```bash
make prod
```

This starts the API and worker as separate containers with resource limits, healthchecks, and automatic restarts.

**With PM2 (without Docker):**

Both the API server and BullMQ worker must run as **separate processes**. Use the included PM2 config:

```bash
pm2 start ecosystem.config.js --env production
```

Zero-downtime reload after deployment:

```bash
pm2 reload ecosystem.config.js --env production
```

> The API (`dist/server.js`) runs in **cluster** mode across all CPU cores. The worker (`dist/jobs/run-workers.js`) runs in **fork** mode with BullMQ internal concurrency of 5; it is the only process that schedules cron jobs, so keep it at one instance. `cwd` pins `.env` and `client/storage` to the project root, and `kill_timeout` (API 20 s, worker 35 s) gives both processes time to finish their graceful shutdown before PM2 kills them.

---

## Docker Architecture

The Docker setup uses a **multi-stage Dockerfile** for optimized production builds and **Docker Compose** for service orchestration.

For full implementation details, see [DOCKER_IMPLEMENTATION.md](DOCKER_IMPLEMENTATION.md).

### Services

| Service    | Image                    | Purpose                          | Port (host-bound)   |
| ---------- | ------------------------ | -------------------------------- | ------------------- |
| `postgres` | `postgis/postgis:18-3.6` | PostgreSQL + PostGIS             | `127.0.0.1:5433`    |
| `redis`    | `redis:8.8.0`            | Cache, queue broker, rate limits | `127.0.0.1:6379`    |
| `api`      | Built from `Dockerfile`  | Express API server               | `127.0.0.1:${PORT}` |
| `worker`   | Built from `Dockerfile`  | BullMQ background workers        | —                   |
| `migrate`  | Built from `Dockerfile`  | Prisma migrate (runs once)       | —                   |

### Resource Limits

| Service    | CPU Limit | Memory Limit |
| ---------- | --------- | ------------ |
| `postgres` | 1.0       | 512 MB       |
| `redis`    | 0.5       | 256 MB       |
| `api`      | 1.0       | 1 GB         |
| `worker`   | 0.5       | 256 MB       |

### Volumes

| Volume                   | Mounted At                           | Purpose           |
| ------------------------ | ------------------------------------ | ----------------- |
| `express-core-pgdata`    | `/var/lib/postgresql`                | PostgreSQL data   |
| `express-core-redisdata` | `/data`                              | Redis persistence |
| bind mount               | `/app/client/storage/public/uploads` | Uploaded files    |

### Healthchecks

- **PostgreSQL**: `pg_isready` every 10s
- **Redis**: `redis-cli ping` (with auth) every 10s
- **API**: `GET /api/v1/health/ready` every 30s (start period: 15s) via `node -e "fetch(...)"`, so it also works in the `deps` image used by `make dev`; returns 503 if DB or Redis is down
- **Worker**: `/tmp/worker-health` must be younger than one minute (rewritten every 10s)

On `SIGTERM` (for example `docker compose stop`) the API closes HTTP, queues, PostgreSQL and
Redis; the worker also stops its schedules and lets active jobs finish (grace period 35s).

### Environment File

A single `.env` file is used for everything:

- Docker Compose reads it for `${}` variable substitution in YAML
- Containers receive it via `env_file:` (as `process.env.*`)
- Local development reads it through `src/config/env.ts`, which never overrides variables
  already set in the environment

Template: `.env.example`

---

## Deployment (VPS)

For production deployment on a VPS (Ubuntu 24.04 + Nginx + Let's Encrypt), see the full guide in [DOCKER_IMPLEMENTATION.md → VPS Deployment](DOCKER_IMPLEMENTATION.md#vps-deployment).

### Quick Reference

Two deployment options are supported:

| Option               | How it works                                                               | Best for                 |
| -------------------- | -------------------------------------------------------------------------- | ------------------------ |
| **A: Registry pull** | CI builds image → pushes to GHCR/Bitbucket Packages → VPS pulls + restarts | Teams, CI/CD pipelines   |
| **B: Build on VPS**  | VPS does `git pull` → `docker compose up --build -d`                       | Solo devs, simple setups |

### Example CI/CD configs (in repo root)

- `.github/workflows/deploy.yml.example` — GitHub Actions + GHCR
- `bitbucket-pipelines.yml.example` — Bitbucket Pipelines + Bitbucket Packages
- `docker-compose.prod.yml.example` — Production override (uses registry images)

> Copy and rename without `.example` to activate. Configure secrets per the [CI/CD setup guide](DOCKER_IMPLEMENTATION.md#step-6-cicd-secrets-configuration).

---

## API Endpoints

Base URL: `http://localhost:3001/api/v1`

### Auth

| Method | Endpoint                       | Auth | Description                                        |
| ------ | ------------------------------ | ---- | -------------------------------------------------- |
| POST   | `/auth/register`               |      | Register a new user (sends verification email)     |
| POST   | `/auth/login`                  |      | Login — returns access token + sets refresh cookie |
| POST   | `/auth/logout`                 | ✓    | Logout — clears refresh token                      |
| POST   | `/auth/refresh`                | ✓    | Renew access token via HTTP-only refresh cookie    |
| GET    | `/auth/verify-email?token=`    |      | Verify email address                               |
| POST   | `/auth/request-password-reset` |      | Email a reset link (`PASSWORD_RESET_URL?token=…`)  |
| POST   | `/auth/reset-password`         |      | Reset password with token                          |

Browser protection:

- Protected routes authenticate only with `Authorization: Bearer <accessToken>`; the
  refresh cookie is never accepted there.
- `/auth/login`, `/auth/refresh` and `/auth/logout` (the cookie endpoints) reject requests
  whose `Origin`, or `Referer` when `Origin` is absent, is not listed in `ALLOWED_ORIGINS`
  (`403 Request origin not allowed`). Callers that send neither header (server-to-server,
  mobile, curl) are accepted.
- Any request carrying a disallowed `Origin` is rejected by CORS with `403 Not allowed by CORS`.

### Users _(auth + RBAC permission required)_

| Method | Endpoint       | Permission                       | Description                          |
| ------ | -------------- | -------------------------------- | ------------------------------------ |
| GET    | `/users`       | `module.master-data.user.index`  | List users (paginated)               |
| GET    | `/users/:slug` | `module.master-data.user.index`  | Get user by slug                     |
| POST   | `/users`       | `module.master-data.user.create` | Create user (supports avatar upload) |
| PUT    | `/users/:slug` | `module.master-data.user.edit`   | Update user (supports avatar upload) |
| DELETE | `/users/:slug` | `module.master-data.user.delete` | Soft delete user                     |

User payloads returned by `POST/PUT /users`, `GET /users/:slug`, `GET/PUT /profile` and
`POST /auth/register` contain only public fields (`slug`, `name`, `email`, `avatar`,
`avatarUrl`, `isEmailVerified`, `createdAt`, `updatedAt` and, for the profile, `role`).
They never include `password`, `id`, `roleId` or `deletedAt`; `slug` is the public
identifier. The paginated `GET /users` list still returns `id` and the nested `role`
(`id`, `title`, `slug`, `userType`).

### Profile _(auth required)_

| Method | Endpoint   | Description                                       |
| ------ | ---------- | ------------------------------------------------- |
| GET    | `/profile` | Get logged-in user profile                        |
| PUT    | `/profile` | Update profile (supports avatar upload, max 2 MB) |

### Roles _(auth + RBAC permission required)_

| Method | Endpoint             | Permission                       | Description                          |
| ------ | -------------------- | -------------------------------- | ------------------------------------ |
| GET    | `/roles/access-list` | ✓ (auth only)                    | Get full structured permissions tree |
| GET    | `/roles`             | `module.master-data.role.index`  | List roles (paginated)               |
| GET    | `/roles/:slug`       | `module.master-data.role.index`  | Get role by slug                     |
| POST   | `/roles`             | `module.master-data.role.create` | Create role with access JSON         |
| PUT    | `/roles/:slug`       | `module.master-data.role.edit`   | Update role                          |
| DELETE | `/roles/:slug`       | `module.master-data.role.delete` | Soft delete role                     |

### Activity Logs _(auth + RBAC permission required)_

| Method | Endpoint                      | Permission                       | Description                        |
| ------ | ----------------------------- | -------------------------------- | ---------------------------------- |
| GET    | `/activity-logs`              | `module.history.activity.index`  | List all activity logs (paginated) |
| GET    | `/activity-logs/:id`          | `module.history.activity.detail` | Get activity log by ID             |
| GET    | `/activity-logs/user/:userId` | `module.history.activity.index`  | Get logs by user ID                |

### Utils _(auth required)_

| Method | Endpoint              | Description                                |
| ------ | --------------------- | ------------------------------------------ |
| GET    | `/utils/role-options` | Get roles as dropdown options (id + title) |

### Health

| Method | Endpoint        | Description                                       |
| ------ | --------------- | ------------------------------------------------- |
| GET    | `/health`       | Check server status (always 200)                  |
| GET    | `/health/ready` | Readiness check — returns 503 if DB/Redis is down |

---

## Email Delivery and Dead Letters

Emails are never sent from the request path. Registration, email verification and
password-reset requests write an **outbox** row in the same database transaction as the
change itself, so a rollback removes the intent and a Redis outage cannot lose it. The
worker's relay publishes due rows to BullMQ (job id `outbox-<id>`), retries Redis failures
with exponential backoff, and dead-letters a row after `OUTBOX_MAX_PUBLISH_ATTEMPTS`.

The email worker retries transient SMTP failures (timeouts, 4xx) and fails permanent ones
(5xx, rejected recipients, missing mail configuration, unknown jobs) immediately. Final
failures are copied to `dead_letter_jobs`. A Redis marker (`email:sent:<jobId>`, 24 h)
stops retries and re-publishes of the same job from sending twice; delivery is still
at-least-once (a crash between sending and writing the marker can repeat one email).

Re-drive a dead-lettered job after fixing its cause (for example SMTP credentials):

```bash
make redrive id=42 by=alice      # or: npm run dlq:redrive -- 42 --by alice
```

A row can be re-driven only once (stamped with `redriven_at`, `redriven_by` and the new
outbox id). Verification and reset emails are refused when their token is gone, expired
or used — the user must request a new email. Published outbox rows keep no payload;
`dead_letter_jobs` payloads can contain tokens and email addresses, have no HTTP endpoint,
and are pruned daily (`OUTBOX_RETENTION_PUBLISHED_DAYS`, `OUTBOX_RETENTION_FAILED_DAYS`,
`DLQ_RETENTION_DAYS`).

---

## File Uploads

Uploaded files are stored at `client/storage/public/uploads/{folder}/` with a crypto-random filename.

Files are served as static assets at:

```
http://localhost:3001/storage/uploads/{folder}/{filename}
```

| Context        | Folder    | Allowed Types                           | Max Size |
| -------------- | --------- | --------------------------------------- | -------- |
| User avatar    | `avatars` | `image/jpeg`, `image/png`, `image/webp` | 2 MB     |
| Profile avatar | `avatars` | `image/jpeg`, `image/png`, `image/webp` | 2 MB     |

---

## Logging

| Environment   | Output                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| `production`  | JSON lines on stdout (`docker compose logs`, `pm2 logs`)                   |
| other         | Readable console output                                                    |
| `test`        | Silent                                                                     |
| non-test      | `LOG_TO_FILES=true` also writes `client/storage/logs/{error,combined}.log` |

`ENABLELOG=true` adds one line per `/api/v1` request through the same logger: 4xx/5xx at
`warn` in every environment, successful requests at `info` in development only. No
separate HTTP log files are written, so read-only containers keep working. In Docker only
the `api` service mounts `client/storage/logs`; leave `LOG_TO_FILES=false` there unless you
need files.

---

## Testing

Automated tests run in a disposable Docker stack (separate PostgreSQL, Redis and
temporary storage) and never touch the development database or `.env`:

```bash
make test                      # unit + integration + HTTP, JUnit and coverage reports
make test-unit module=utils    # one suite, filtered by test file name
make test-down                 # remove a stack left by an interrupted run
```

Reports are written to `test-results/` and `coverage/`. See
[docs/testing.md](docs/testing.md) for scope, isolation guards, CI usage and known baseline defects.

---

## Lint

```bash
npm run lint
```

> The ESLint configuration currently fails to load; see [docs/testing.md](docs/testing.md#known-baseline-defects).

---

## License

&copy; 2026 - Present Alfian Andre Ramadhan.
