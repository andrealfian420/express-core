# Docker Implementation Guide

Step-by-step instructions to add Docker support to a project based on this boilerplate.

---

## Who Is This For?

| Scenario                                                 | What to do                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **New project** cloned from this boilerplate             | Docker files already exist. Skip to [Step 1](#step-1-rename-project-identifiers). |
| **Existing project** that forked before Docker was added | Start from [Step 0](#step-0-create-docker-files) to add all required files.       |

---

## Migration Checklist (Quick Glance)

```
[ ] 0. Copy/create Docker files (Dockerfile, docker-compose.yml, etc.)
[ ] 1. Rename `express-core` identifiers in docker-compose.yml
[ ] 2. Apply source code changes (redis config, health module, route registration)
[ ] 3. Verify package.json has required scripts
[ ] 4. Configure environment (.env)
[ ] 5. Adjust ports if needed
[ ] 6. Start the environment (make dev)
[ ] 7. Run seed & verify health endpoint
```

---

## Prerequisites

- Docker Desktop installed (Windows/Mac) or Docker Engine (Linux)
- WSL2 (Windows) with `make` installed (`sudo apt install make`)

---

## Step 0: Create Docker Files

> **Skip this step** if your project already has these files (i.e., you cloned the boilerplate after Docker was added).

Copy or create the following files in your project root:

| File                     | Purpose                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `Dockerfile`             | Multi-stage Node.js build (deps → build → production)         |
| `docker-compose.yml`     | Service orchestration (Postgres, Redis, API, Worker, Migrate) |
| `docker-compose.dev.yml` | Dev overrides: hot-reload, source mounts, dev dependencies    |
| `Makefile`               | Convenience commands (`make dev`, `make seed`, etc.)          |
| `.dockerignore`          | Excludes node_modules, dist, env files from build context     |

### Dockerfile

```dockerfile
# ---- Stage 1: Dependencies ----
FROM node:24-slim AS deps

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# ---- Stage 2: Build ----
FROM node:24-slim AS build

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json tsconfig.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ---- Stage 3: Production ----
FROM node:24-slim AS production

RUN apt-get update && apt-get install -y openssl wget && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate

# Copy compiled output
COPY --from=build /app/dist ./dist

# Create storage directories
RUN mkdir -p client/storage/public/uploads client/storage/logs

# Create non-root user
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/sh appuser

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3001

CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
services:
  postgres:
    image: postgis/postgis:18-3.6
    container_name: express-core-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    ports:
      - '127.0.0.1:5433:5432'
    volumes:
      - express-core-pgdata:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER}']
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
    networks:
      - express-core-network

  redis:
    image: redis:8.8.0
    container_name: express-core-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - '127.0.0.1:6379:6379'
    volumes:
      - express-core-redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '-a', '${REDIS_PASSWORD}', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
    networks:
      - express-core-network

  migrate:
    build:
      context: .
      target: deps
    container_name: express-core-migrate
    user: '1001:1001'
    working_dir: /app
    command: npx prisma migrate deploy
    env_file:
      - .env
    depends_on:
      postgres:
        condition: service_healthy
    restart: 'no'
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
    networks:
      - express-core-network

  api:
    build:
      context: .
      target: production
    container_name: express-core-api
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    env_file:
      - .env
    ports:
      - '127.0.0.1:${PORT:-3001}:${PORT:-3001}'
    volumes:
      - ./client/storage/public/uploads:/app/client/storage/public/uploads
    healthcheck:
      test:
        [
          'CMD',
          'wget',
          '--no-verbose',
          '--tries=1',
          '--spider',
          'http://localhost:${PORT:-3001}/api/v1/health/ready',
        ]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.25'
          memory: 128M
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
    networks:
      - express-core-network

  worker:
    build:
      context: .
      target: production
    container_name: express-core-worker
    restart: unless-stopped
    init: true
    stop_grace_period: 30s
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    command: ['node', 'dist/jobs/run-workers.js']
    env_file:
      - .env
    healthcheck:
      test: ['CMD', 'find', '/tmp/worker-health', '-mmin', '-1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 64M
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '3'
    networks:
      - express-core-network

networks:
  express-core-network:
    name: express-core-network

volumes:
  express-core-pgdata:
    name: express-core-pgdata
  express-core-redisdata:
    name: express-core-redisdata
```

### docker-compose.dev.yml

```yaml
services:
  api:
    build:
      context: .
      target: deps
    read_only: false
    command: npx ts-node-dev --respawn --transpile-only --poll src/server.ts
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma
      - ./tsconfig.json:/app/tsconfig.json
      - ./client/storage/public/uploads:/app/client/storage/public/uploads
      - ./client/storage:/app/client/storage
    environment:
      NODE_ENV: development

  worker:
    build:
      context: .
      target: deps
    read_only: false
    command: npx ts-node-dev --respawn --transpile-only --poll src/jobs/run-workers.ts
    volumes:
      - ./src:/app/src
      - ./prisma:/app/prisma
      - ./tsconfig.json:/app/tsconfig.json
    environment:
      NODE_ENV: development

  migrate:
    command: npx prisma migrate dev
```

### Makefile

```makefile
.PHONY: dev prod build migrate seed logs down clean shell studio

# Development (full Docker with hot-reload)
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Production-like
prod:
	docker compose up --build -d

# Build images only
build:
	docker compose build

# Run migrations (dev mode)
migrate:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm migrate

# Run seed (builds TypeScript first since seed.js imports from dist/)
seed:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api sh -c "npx tsc && npx prisma db seed"

# Tail logs
logs:
	docker compose logs -f

# Stop containers
down:
	docker compose down

# Stop and remove volumes (fresh start)
clean:
	docker compose down -v

# Shell into api container
shell:
	docker compose exec api sh

# Prisma studio
studio:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api npx prisma studio
```

### .dockerignore

```
node_modules
dist
.env
.env.*

# Logs
client/storage/logs
*.log

# Git
.git
.gitignore

# IDE
.vscode
.idea
*.swp
*.swo
```

> **Note:** `.env` is excluded from the Docker **build context** (image), but Docker Compose still reads it at runtime for variable substitution and `env_file:` injection.

---

## Step 1: Rename Project Identifiers

Find and replace `express-core` with your project name in `docker-compose.yml`:

```
express-core-postgres   →  your-project-postgres
express-core-redis      →  your-project-redis
express-core-api        →  your-project-api
express-core-worker     →  your-project-worker
express-core-network    →  your-project-network
express-core-pgdata     →  your-project-pgdata
express-core-redisdata  →  your-project-redisdata
express-core-migrate    →  your-project-migrate
```

> **Why:** Docker volumes and container names are global. If two projects share the same names, their data will collide.

---

## Step 2: Apply Source Code Changes

These modifications ensure the app works correctly inside Docker containers. If your project forked before Docker was implemented, some of these files may need to be **created from scratch**.

### 2.1 `src/config/redis.ts` — Add environment variable support

Your Redis config must support `REDIS_HOST`, `REDIS_PORT`, and `REDIS_PASSWORD` env vars:

```typescript
import Redis from 'ioredis'
import logger from './logger'

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
})

redis.on('error', (err: Error) => {
  logger.error('Redis error:', { err: err.message })
})

redis.on('connect', () => {
  logger.info('Redis connected')
})

export default redis
```

**Why:**

- `REDIS_HOST` — Inside Docker, Redis is reached via the service name `redis`, not `127.0.0.1`.
- `REDIS_PASSWORD` — The Redis container uses `--requirepass`. Without this, the app cannot connect.
- `maxRetriesPerRequest: null` — Required by BullMQ.

---

### 2.2 `src/modules/health/` — Create health module

Create the health module if it doesn't exist. Docker uses this endpoint for container healthchecks.

#### `src/modules/health/health.controller.ts`

```typescript
import { Request, Response } from 'express'
import prisma from '../../config/database'
import logger from '../../config/logger'
import redis from '../../config/redis'

class HealthController {
  async healthCheck(req: Request, res: Response): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production'

    const health = {
      status: 'OK',
      uptime: process.uptime(),
      timestamp: Date.now(),
      services: {
        database: 'UNKNOWN',
        redis: 'UNKNOWN',
      },
    }

    let dbStatus: string | null = null
    let redisStatus: string | null = null

    try {
      await prisma.$queryRaw`SELECT 1`
      dbStatus = 'UP'
    } catch {
      dbStatus = 'DOWN'
      logger.error('Database connection failed')
    }

    try {
      await redis.ping()
      redisStatus = 'UP'
    } catch {
      redisStatus = 'DOWN'
      logger.error('Redis connection failed')
    }

    if (!isProd) {
      health.services.database = dbStatus
      health.services.redis = redisStatus
      health.uptime = process.uptime()
      health.timestamp = Date.now()
    }

    res.status(200).json(health)
  }

  async readyCheck(req: Request, res: Response): Promise<void> {
    try {
      await prisma.$queryRaw`SELECT 1`
      await redis.ping()

      logger.info('Readiness check passed')
      res.status(200).json({ status: 'READY' })
    } catch (error) {
      logger.error('Readiness check failed', { error })
      res.status(503).json({ status: 'NOT_READY' })
    }
  }
}

export default new HealthController()
```

#### `src/modules/health/health.route.ts`

```typescript
import { Router } from 'express'
import healthController from './health.controller'

const router = Router()

router.get('/', healthController.healthCheck)
router.get('/ready', healthController.readyCheck)

export default router
```

**Endpoint behavior:**

| Endpoint                   | Returns                                  | Purpose                                                    |
| -------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `GET /api/v1/health`       | Always HTTP 200                          | Monitoring dashboards, uptime checkers                     |
| `GET /api/v1/health/ready` | HTTP 200 if DB+Redis OK, HTTP 503 if not | Docker healthcheck — triggers container restart on failure |

---

### 2.3 `src/routes/index.ts` — Register health route BEFORE rate limiter

The health route **must** be placed before the `apiRateLimiter` middleware. Otherwise, Docker healthchecks (every 30s) could get rate-limited (HTTP 429), causing false container restarts.

```typescript
import { Request, Response, Router } from 'express'
import { apiRateLimiter } from '../middleware/rate-limit.middleware'

// Importing Routes
import healthRoutes from '../modules/health/health.route'
import userRoutes from '../modules/user/user.route'
import authRoutes from '../modules/auth/auth.route'
// ...other imports

const router = Router()

// Health routes — placed BEFORE rate limiter (used by Docker healthcheck)
router.use('/health', healthRoutes)

// Place auth routes before general API rate limiter
router.use('/auth', authRoutes)

// Apply general API rate limiter to all routes below
router.use(apiRateLimiter)

// Mounting Routes
router.use('/users', userRoutes)
router.use('/profile', profileRoutes)
router.use('/roles', roleRoutes)
router.use('/activity-logs', activityLogRoutes)
router.use('/utils', helperRoutes)
```

> **Key change:** `router.use('/health', healthRoutes)` is placed **before** `router.use(apiRateLimiter)`.

---

## Step 3: Verify `package.json` Scripts

Ensure these scripts exist in your `package.json`:

```json
{
  "scripts": {
    "build": "tsc --diagnostics",
    "start": "node dist/server.js",
    "start:worker": "node dist/jobs/run-workers.js",
    "seed": "tsc && node prisma/seed.js"
  }
}
```

| Script         | Used by                                                         |
| -------------- | --------------------------------------------------------------- |
| `build`        | Dockerfile Stage 2 (`npm run build`)                            |
| `start`        | Dockerfile CMD                                                  |
| `start:worker` | Worker container (optional, compose uses direct `node` command) |
| `seed`         | `make seed` command                                             |

---

## Step 4: Configure Environment

This project uses a **single `.env` file** for everything:

- Docker Compose reads it for `${}` variable substitution in YAML
- Containers receive it via `env_file:` (as `process.env.*`)
- Local development reads it via `dotenv`

```bash
cp .env.example .env
```

Edit `.env` and update the values:

```env
# ==============================================================================
# Environment Configuration
# ==============================================================================

APP_NAME="Your App Name"
APP_URL="http://localhost:3001"
NODE_ENV=development                    # use "production" for Docker prod
PORT=3001

ENABLECORS=false
ENABLEHELMET=false
FORMLIMIT=52428800
ENABLELOG=true

# ==============================================================================
# Database (PostgreSQL)
# ==============================================================================
# Local:  postgresql://user:password@localhost:5432/db_express?schema=public
# Docker: postgresql://<DB_USER>:<DB_PASSWORD>@postgres:5432/<DB_NAME>?schema=public
DATABASE_URL="postgresql://postgres:root@postgres:5432/db_express?schema=public"

# Used by Docker Compose to initialize the PostgreSQL container
# Must match the credentials in DATABASE_URL above
DB_USER=postgres
DB_PASSWORD=root
DB_NAME=db_express

# ==============================================================================
# JWT
# ==============================================================================
# Generate with: node -e "console.log(require('crypto').randomBytes(512).toString('hex'))"
JWT_ACCESS_SECRET=change_this_to_a_secure_random_string
JWT_ACCESS_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
BCRYPT_ROUNDS=10

# ==============================================================================
# SMTP Mail
# ==============================================================================
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM="Your App <noreply@example.com>"

# ==============================================================================
# Redis
# ==============================================================================
# Local:  127.0.0.1
# Docker: redis (Docker service name)
REDIS_HOST=redis
REDIS_PORT=6379

# Generate with: node -e "console.log(require('crypto').randomBytes(128).toString('hex'))"
# Used by Docker Compose for Redis --requirepass AND by the app for ioredis connection
REDIS_PASSWORD=secret

# ==============================================================================
# CORS
# ==============================================================================
# Comma-separated list of allowed origins
ALLOWED_ORIGINS="http://localhost:3001,http://localhost:5173"
```

### Switching between Docker and local development

| Variable         | Docker value            | Local (native) value               |
| ---------------- | ----------------------- | ---------------------------------- |
| `DATABASE_URL`   | `...@postgres:5432/...` | `...@localhost:5432/...`           |
| `REDIS_HOST`     | `redis`                 | `127.0.0.1`                        |
| `REDIS_PASSWORD` | your password           | empty (if local Redis has no auth) |

> **Tip:** If you frequently switch between Docker and local, you can keep two env files (`.env` for Docker, `.env.local` for native) and symlink as needed. But for most teams, Docker-first is simpler.

---

## Step 5: Adjust Ports (if running multiple projects)

Each project needs unique host ports:

| Service    | Default Port | Where to change                       |
| ---------- | ------------ | ------------------------------------- |
| API        | 3001         | `PORT` in `.env`                      |
| PostgreSQL | 5433         | `docker-compose.yml` → postgres ports |
| Redis      | 6379         | `docker-compose.yml` → redis ports    |

Example for a second project:

```yaml
# docker-compose.yml
postgres:
  ports:
    - '127.0.0.1:5434:5432' # Different host port

redis:
  ports:
    - '127.0.0.1:6380:6379' # Different host port
```

And set `PORT=3002` in `.env`.

---

## Step 6: Start the Environment

```bash
# Development (hot-reload)
make dev

# Wait for all containers to be healthy, then seed:
make seed

# Verify
curl http://localhost:3001/api/v1/health
```

---

## Note: `ecosystem.config.js` and PM2

If your project has `ecosystem.config.js`, that file is for **PM2-based deployments** (non-Docker). When using Docker:

- Docker Compose handles process management, restarts, and orchestration
- PM2 is **not used** inside containers
- You can keep `ecosystem.config.js` for non-Docker deployments, or remove it if fully committed to Docker

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Docker Network (your-project-network)                   │
│                                                         │
│  ┌──────────┐  ┌───────┐  ┌─────────┐  ┌──────────┐  │
│  │ Postgres │  │ Redis │  │   API   │  │  Worker  │  │
│  │  :5432   │  │ :6379 │  │  :3001  │  │ (BullMQ) │  │
│  └──────────┘  └───────┘  └─────────┘  └──────────┘  │
│       ▲              ▲          │              │        │
│       └──────────────┴──────────┴──────────────┘        │
│                                                         │
│  ┌─────────────┐                                       │
│  │   Migrate   │ (one-off, exits after completion)     │
│  └─────────────┘                                       │
└─────────────────────────────────────────────────────────┘

Host ports (127.0.0.1 only):
  - API:      localhost:3001
  - Postgres: localhost:5433
  - Redis:    localhost:6379
```

### Startup Order

```
postgres (healthy) ─┐
                    ├─► migrate (completed) ─┬─► api
redis (healthy) ────┘                        └─► worker
```

---

## File Reference

| File                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `Dockerfile`             | Multi-stage build: `deps` → `build` → `production`          |
| `docker-compose.yml`     | Production-like orchestration (all services)                |
| `docker-compose.dev.yml` | Dev overrides: hot-reload, source mounts, dev deps          |
| `.dockerignore`          | Excludes unnecessary files from build context               |
| `.env`                   | Single environment file (compose substitution + app config) |
| `.env.example`           | Template for `.env`                                         |
| `Makefile`               | Convenience commands for developers                         |

---

## Available Commands

| Command        | Action                                             |
| -------------- | -------------------------------------------------- |
| `make dev`     | Start dev environment with hot-reload (detached)   |
| `make prod`    | Start production-like environment                  |
| `make build`   | Build Docker images only                           |
| `make migrate` | Run Prisma migrations (dev mode)                   |
| `make seed`    | Compile TypeScript + run database seeder           |
| `make logs`    | Tail all container logs                            |
| `make shell`   | Open shell in API container                        |
| `make studio`  | Open Prisma Studio                                 |
| `make down`    | Stop all containers                                |
| `make clean`   | Stop + remove containers and volumes (fresh start) |

---

## Dockerfile Stages

| Stage        | Build Target         | Used By                                                                 |
| ------------ | -------------------- | ----------------------------------------------------------------------- |
| `deps`       | `target: deps`       | Dev containers (api, worker, migrate) — includes devDependencies        |
| `build`      | Internal             | Compiles TypeScript, generates Prisma client                            |
| `production` | `target: production` | Prod containers (api, worker) — only production deps + compiled `dist/` |

---

## Hot-Reload (Development)

The dev override uses `ts-node-dev --poll` for file watching:

```yaml
command: npx ts-node-dev --respawn --transpile-only --poll src/server.ts
```

**Why `--poll`?** Linux `inotify` does not propagate filesystem events from Windows host volume mounts. Polling checks files periodically instead.

**Performance:** Negligible overhead for small projects (<100 files) on SSD.

**Alternative:** If you move the project into the WSL filesystem (`~/projects/...`), you can remove `--poll` — inotify works natively there.

---

## Security & Production Hardening

- All ports bound to `127.0.0.1` (localhost only)
- Redis protected with password authentication
- App runs as non-root user (`appuser:appgroup`, UID 1001) in production
- `.env` is git-ignored (credentials stay out of repo)
- `.dockerignore` excludes `.env` from the build image (injected at runtime only)
- Healthcheck uses `/api/v1/health/ready` which returns 503 if DB/Redis is down
- **No insecure defaults** — `.env` must exist with all required variables; compose fails fast otherwise
- **`init: true`** — Uses tini as PID 1 for proper signal forwarding and zombie reaping
- **`read_only: true`** — Container filesystem is immutable; only `/tmp` (tmpfs) and explicit volumes are writable
- **`cap_drop: ALL`** — All Linux capabilities dropped; minimal attack surface
- **`no-new-privileges`** — Prevents privilege escalation inside containers
- **`stop_grace_period: 30s`** — Allows graceful shutdown with in-flight request draining
- **Log rotation** — JSON log driver with 10MB max size, 3 file rotation (prevents disk fill)
- **Worker healthcheck** — File-based liveness probe detects deadlocked workers
- **Graceful shutdown with timeout** — App drains connections on SIGTERM; force-exits after 15s if stuck

---

## Connecting External Tools

### DBeaver / Database Client

| Field    | Value                                              |
| -------- | -------------------------------------------------- |
| Host     | `localhost`                                        |
| Port     | `5433` (or whatever you set in docker-compose.yml) |
| Database | Value of `DB_NAME`                                 |
| User     | Value of `DB_USER`                                 |
| Password | Value of `DB_PASSWORD`                             |

### Redis Client (RedisInsight, etc.)

| Field    | Value                     |
| -------- | ------------------------- |
| Host     | `localhost`               |
| Port     | `6379`                    |
| Password | Value of `REDIS_PASSWORD` |

---

## Production Deployment Notes

### Remove host port mappings

In production, Postgres and Redis should not be accessible from the host. Remove `ports:` from those services and access them only via the internal Docker network:

```yaml
# Remove these for production:
# postgres:
#   ports:
#     - '127.0.0.1:5433:5432'
# redis:
#   ports:
#     - '127.0.0.1:6379:6379'
```

### Image tagging for CI/CD

For production deployments, tag images with git SHA or semver instead of `latest`:

```bash
docker compose build --build-arg VERSION=$(git rev-parse --short HEAD)
docker tag express-core-api:latest registry.example.com/express-core-api:$(git rev-parse --short HEAD)
```

### Database backups

Named volumes persist data, but are not backed up automatically. Recommended:

```bash
# PostgreSQL backup (run from host or a backup container)
docker compose exec postgres pg_dump -U $DB_USER $DB_NAME > backup_$(date +%Y%m%d).sql
```

Consider automating this with a cron job or a dedicated backup service.

### File uploads and horizontal scaling

The current setup uses a host bind-mount (`./client/storage/public/uploads`) for uploaded files. This works for single-node deployments but **prevents horizontal scaling** (multiple API containers won't share the same filesystem).

For multi-node production, migrate to object storage (S3, GCS, MinIO).

---

## Troubleshooting

| Problem                                         | Cause                             | Solution                                                                       |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `PORT variable not set` warning                 | `.env` missing or incomplete      | Create `.env` with `PORT=3001`                                                 |
| Hot-reload not working                          | `inotify` doesn't work cross-OS   | Ensure `--poll` flag is present in `docker-compose.dev.yml`                    |
| Redis "does not require authentication" warning | Missing `--requirepass`           | Add `command: redis-server --requirepass ${REDIS_PASSWORD:-secret}`            |
| Container/volume name conflicts                 | Generic names                     | Use project-specific prefixes (Step 1)                                         |
| `socket hang up` in Postman                     | Port mismatch                     | Ensure `PORT` in `.env` matches what you're hitting                            |
| Prisma `openssl` error                          | Alpine incompatibility            | Use `node:XX-slim` (not Alpine) + install `openssl`                            |
| PostgreSQL unhealthy on PG 18+                  | Data directory structure changed  | Mount volume to `/var/lib/postgresql` (not `/var/lib/postgresql/data`)         |
| Heap out of memory during `npx tsc`             | Container memory limit too low    | API container needs ≥1G, or set `NODE_OPTIONS=--max-old-space-size=384`        |
| `Cannot find module '../dist/...'` during seed  | `dist/` doesn't exist in dev mode | Run `npx tsc` before `prisma db seed` (handled by `make seed`)                 |
| Health endpoint returns 429                     | Health route behind rate limiter  | Move `router.use('/health', healthRoutes)` before `router.use(apiRateLimiter)` |
| App can't connect to Redis/Postgres             | Wrong host in `.env`              | Use `redis` / `postgres` (service names) for Docker, `127.0.0.1` for local     |
