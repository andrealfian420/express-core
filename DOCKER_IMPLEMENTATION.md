# Docker Implementation Guide

Step-by-step instructions to set up Docker for a new project based on this boilerplate.

---

## Prerequisites

- Docker Desktop installed (Windows/Mac) or Docker Engine (Linux)
- WSL2 (Windows) with `make` installed (`sudo apt install make`)

---

## Step 1: Rename Project Identifiers

Find and replace `express-core` with your project name across these files:

| File                     | What to replace                                   |
| ------------------------ | ------------------------------------------------- |
| `docker-compose.yml`     | Container names, volume names, network name       |
| `docker-compose.dev.yml` | No changes needed (inherits from main)            |
| `Makefile`               | No changes needed (uses generic compose commands) |

Specifically, replace these occurrences in `docker-compose.yml`:

```
express-core-postgres   →  your-project-postgres
express-core-redis      →  your-project-redis
express-core-api        →  your-project-api
express-core-worker     →  your-project-worker
express-core-network    →  your-project-network
express-core-pgdata     →  your-project-pgdata
express-core-redisdata  →  your-project-redisdata
express-migrate         →  your-project-migrate
```

> **Why:** Docker volumes and container names are global. If two projects share the same names, their data will collide.

---

## Step 2: Configure Environment Files

### `.env` (Docker Compose variable substitution)

This file is read by Docker Compose **itself** to resolve `${}` variables in YAML files. It is NOT injected into containers.

```env
PORT=3001
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_NAME=your_database_name
REDIS_PASSWORD=your_redis_password
```

### `.env.docker` (Container app environment)

This file is injected into containers via `env_file:`. The app reads these as `process.env.*`.

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` and update:

| Variable                            | Action                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `PORT`                              | Must match the value in `.env`                                                        |
| `DATABASE_URL`                      | Update DB name/user/password to match `.env`                                          |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Must match `.env`                                                                     |
| `JWT_ACCESS_SECRET`                 | Generate: `node -e "console.log(require('crypto').randomBytes(512).toString('hex'))"` |
| `REDIS_PASSWORD`                    | Must match `.env`                                                                     |
| `SMTP_*`                            | Your SMTP credentials                                                                 |

### Important: Variables used in BOTH files

These variables appear in `docker-compose.yml` (as `${}`) AND are needed by the app:

- `PORT` — port mapping + app listen port
- `REDIS_PASSWORD` — Redis server auth + ioredis connection
- `DB_USER`, `DB_PASSWORD`, `DB_NAME` — Postgres container init + app connection

They must have the **same values** in both `.env` and `.env.docker`.

---

## Step 3: Adjust Ports (if running multiple projects)

Each project needs unique host ports. Update in **both** `.env` and `.env.docker`:

| Service    | Default Port | Where to change                       |
| ---------- | ------------ | ------------------------------------- |
| API        | 3001         | `PORT` in `.env` + `.env.docker`      |
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

And set `PORT=3002` in both env files.

---

## Step 4: Start the Environment

```bash
# Development (hot-reload)
make dev

# Wait for all containers to be healthy, then seed:
make seed

# Verify
curl http://localhost:3001/api/v1/health
```

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

| File                     | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `Dockerfile`             | Multi-stage build: `deps` → `build` → `production` |
| `docker-compose.yml`     | Production-like orchestration (all services)       |
| `docker-compose.dev.yml` | Dev overrides: hot-reload, source mounts, dev deps |
| `.dockerignore`          | Excludes unnecessary files from build context      |
| `.env`                   | Docker Compose YAML variable substitution          |
| `.env.docker`            | App environment inside containers                  |
| `.env.docker.example`    | Template for `.env.docker`                         |
| `Makefile`               | Convenience commands for developers                |

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

## Security Notes

- All ports bound to `127.0.0.1` (localhost only)
- Redis protected with password authentication
- App runs as non-root user (`appuser:appgroup`, UID 1001) in production
- `.env.docker` is git-ignored (credentials stay out of repo)
- Healthcheck uses `/api/v1/health/ready` which returns 503 if DB/Redis is down

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

## Troubleshooting

| Problem                                          | Cause                                          | Solution                                                                |
| ------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| `PORT variable not set` warning                  | `.env` missing or incomplete                   | Create `.env` with `PORT=3001`                                          |
| Hot-reload not working (changes not reflected)   | `inotify` doesn't work cross-OS                | Ensure `--poll` flag is present in `docker-compose.dev.yml`             |
| Redis "does not require authentication" warning  | Missing `--requirepass`                        | Add `command: redis-server --requirepass ${REDIS_PASSWORD:-secret}`     |
| Container/volume name conflicts between projects | Generic names like `redis`, `postgredata`      | Use project-specific prefixes (Step 1)                                  |
| `socket hang up` in Postman                      | Port mismatch between `.env` and `.env.docker` | Ensure `PORT` value is identical in both files                          |
| Prisma `openssl` error                           | Alpine incompatibility                         | Use `node:XX-slim` (not Alpine) + install `openssl`                     |
| PostgreSQL unhealthy on PG 18+                   | Data directory structure changed               | Mount volume to `/var/lib/postgresql` (not `/var/lib/postgresql/data`)  |
| Heap out of memory during `npx tsc`              | Container memory limit too low                 | API container needs ≥1G, or set `NODE_OPTIONS=--max-old-space-size=384` |
| `Cannot find module '../dist/...'` during seed   | `dist/` doesn't exist in dev mode              | Run `npx tsc` before `prisma db seed` (handled by `make seed`)          |

---

## Quick Start Checklist

```
[ ] 1. Find-replace `express-core` → `your-project-name` in docker-compose.yml
[ ] 2. Copy .env.docker.example → .env.docker (edit secrets)
[ ] 3. Create .env with PORT, DB_USER, DB_PASSWORD, DB_NAME, REDIS_PASSWORD
[ ] 4. Adjust ports if running alongside other projects
[ ] 5. Ensure source code changes are applied (see below)
[ ] 6. Run `make dev`
[ ] 7. Run `make seed` (after containers are healthy)
[ ] 8. Test: curl http://localhost:PORT/api/v1/health
```

---

## Source Code Changes Required

These modifications were made to the application source code to support Docker:

### 1. `src/config/redis.ts` — Add password support

```typescript
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  password: process.env.REDIS_PASSWORD || undefined, // ← Added
  maxRetriesPerRequest: null,
})
```

**Why:** Redis container is configured with `--requirepass`. Without the password in the ioredis config, the app (and BullMQ workers) cannot connect.

**Affected services:** All code using the shared `redis` instance — API server, BullMQ queues (`email.queue.ts`, `system.queue.ts`), and workers (`email.worker.ts`, `system.worker.ts`).

### 2. `src/modules/health/health.controller.ts` — Healthcheck endpoint

The `/api/v1/health` endpoint always returns HTTP 200 regardless of DB/Redis status (for monitoring dashboards).

The `/api/v1/health/ready` endpoint returns:

- HTTP 200 if DB and Redis are both reachable
- HTTP 503 if either is down

Docker healthcheck is configured to hit `/api/v1/health/ready` so containers are marked unhealthy and restarted when dependencies are down.

### 3. `.env.example` — Add Redis password variable

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# create with 'node -e "console.log(require('crypto').randomBytes(128).toString('hex'))"'
REDIS_PASSWORD=secret
```

**Why:** Developers running without Docker also need `REDIS_PASSWORD` if their local Redis has authentication enabled. Setting `undefined` (empty/missing) skips auth for local development without Redis password.

### 4. `.dockerignore` — Exclude all env files

```
.env
.env.*
```

**Why:** No `.env.*` files should leak into the Docker image. The `env_file:` directive in docker-compose injects variables at runtime, not at build time. Previously `!.env.docker` was included as an exception — this was removed because it's unnecessary and a security risk.
