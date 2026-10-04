<!-- Purpose: Document isolated testing commands, scope, fixture safety, CI gates and known baseline defects.
Caller: Developers, reviewers and coding agents.
Dependencies: Makefile, scripts/test-*.cjs, scripts/test-compose.sh, docker-compose.test.yml, CI templates, src/config/env.ts.
Main Functions: Explain execution, structure, isolation guards, reports, CI usage and troubleshooting.
Side Effects: None; the commands described here create and remove disposable test resources only. -->
# Automated testing

Use `make test` for the complete unit, integration and HTTP suite. The development
stack can keep running: tests use a separate Compose project (`express-core-testing`),
network, PostgreSQL database, Redis and temporary upload directory, with no host
ports and no application `.env` file.

## Commands

| Command | Purpose |
| --- | --- |
| `make test` | Full suite (`ci`): unit, migrations, integration, HTTP, JUnit and cumulative coverage |
| `make test-unit` | Pure unit tests; no database or Redis services are started |
| `make test-unit module=utils` | Run only test files whose name contains `utils` (works for every suite) |
| `make test-watch` | Compile and re-run unit tests on change until interrupted |
| `make test-integration` | Real persistence, cache, queue and service checks |
| `make test-http` | Supertest requests through the real Express application |
| `make test-down` | Remove only the dedicated test stack (after an interrupted run) |

`scripts/test-compose.sh` builds the runner image from the `deps` stage of the
`Dockerfile`, starts only the services a suite needs, and always tears the stack down,
on success, failure or interruption, while preserving the exit code. Avoid concurrent
`make test*` invocations: they share one Compose project. Never use `make clean` for
test cleanup; it removes the development volumes.

The npm scripts (`npm test`, `npm run test:unit|test:integration|test:http|test:watch|test:ci`)
run the same runner in any Node 24 environment. Service suites additionally require
`TEST_RESOURCE_OWNER=express-core-test` and provisioned disposable services: PostgreSQL
user, password and database `express_core_test`, and Redis password `express_core_test`.
`TEST_DB_HOST` and `TEST_REDIS_HOST` accept the Compose service names or loopback
(default `127.0.0.1`). Prefer the Docker targets over a shared local instance.

## Structure and scope

- `tests/unit`: environment guard, configuration validation (`src/config/env.ts`), the
  graceful-shutdown sequence, HTTP request logging, middleware (Bearer auth, cookie-endpoint
  origin guard, validation, errors), storage root, tokens/JWT/slugs/links/pagination, the user
  response serializer and request schemas. No database or Redis imports.
- `tests/integration`: auth transactions and token lifecycles, the verification email from
  registration through a real BullMQ worker to a mocked transport and back through its link,
  cache, readiness failures, maintenance cleanup, audit persistence, cron schedules (job
  payload/options, time-slot deduplication that survives completion, enqueue failures), Redis
  rate limiting, and the real API/worker entrypoints run as child processes
  (`process.test.ts`).
- `tests/http`: access matrix (401/403/200), CORS rejection, the Origin/Referer matrix on
  cookie endpoints, Bearer-only protected routes, cookie attributes, client-safe user
  payloads, profile ownership, user/role administration, audit records, soft delete and
  RBAC cache invalidation.
- `tests/support`: guarded reset, the `actor()` identity fixture and the HTTP helper.

Every feature, fix or behavior change must carry meaningful tests in the same change.
Name files after their module so `module=...` can select them. Use integration tests for
persistence and transactions instead of mocking Prisma, and HTTP tests for controller and
route contracts instead of duplicating those assertions in unit tests.

## Isolation and fixtures

`scripts/test-environment.cjs` is the single source of the test identity. `configure()`
replaces every application setting the tests read (database URL, Redis, JWT secret, SMTP,
`APP_URL`, `ALLOWED_ORIGINS`, low bcrypt cost) and creates a temporary `STORAGE_ROOT`;
no application secret is inherited. `assertTarget()` refuses to continue unless
`NODE_ENV=test`, the explicit resource declaration, the test database name/user/password,
a loopback or Compose host, the test Redis password and the temporary storage prefix all match.

Test files never import `server.ts` or `run-workers.ts`. `tests/integration/process.test.ts`
runs their compiled versions as child processes that inherit the test configuration, inside
temporary working directories (removed afterwards), with the API on port 3101; each child is
stopped with SIGTERM and killed in `finally` if it is still running. Under `NODE_ENV=test`
`src/config/env.ts` never reads a `.env` file, so a developer `.env` cannot leak into tests;
the process test passes a fixture `.env` only to children started in other modes.

Before migrations the runner repeats the identity check against the live connection
(`current_database()`, `current_user`); the fixture helper repeats it before every
truncation. All committed migrations run against the disposable database; seeders are not
run. Before each integration/HTTP case every application table is truncated (migration
metadata and PostGIS reference tables are kept) and the dedicated Redis is flushed. Suites
run serially so resets never race.

Each test file closes the queues, both Prisma clients, Redis and the logger in an `after`
hook. Tests that start workers must close them in `finally` before fixture teardown.
Mock external transports, restore mocks after each test, and await queue state or poll
with a deadline instead of fixed sleeps. The logger is silent and writes no files under
`NODE_ENV=test`. The runner removes the temporary storage root when it exits.

## CI and reports

`bitbucket-pipelines.yml.example` and `.github/workflows/deploy.yml.example` run a verify
step before building or deploying: `npm ci`, `prisma generate`, `npm run build`, then
`npm run test:ci` against disposable PostgreSQL and Redis service containers. Because CI
service containers cannot receive a command, the Redis password is set with `CONFIG SET`
before the tests. Any nonzero build, migration or test exit blocks the following steps.

JUnit files are written to `test-results/`; text summary, HTML and LCOV coverage to
`coverage/`. Coverage includes untouched source files and excludes type declarations and
the two process entrypoints. No percentage gate is enforced; reports accumulate across
the unit, integration and HTTP suites of one `ci` run. Test compilation goes to
`.test-build/` with source maps; the production `dist/` never contains test files.

## Configuration metadata

`package.json` defines the npm entrypoints and the development-only Supertest and c8
packages; `package-lock.json` pins their dependencies. JSON files cannot carry comment
headers, so they are documented here. `tsconfig.test.json` extends `tsconfig.json` and
widens `rootDir` to compile `tests/`. `STORAGE_ROOT` (see `src/config/storage.ts`) changes
the filesystem root for uploads, deletion and static serving, never the public URLs; its
default stays `client/storage/public` under the working directory.

## Troubleshooting

Read the failing case in the terminal output or `test-results/*.xml`. A selection that
matches no file fails instead of passing silently. Never skip, weaken or delete an
assertion to obtain a green pipeline. Remove a stack left by an interrupted Docker run
with `make test-down`. The runner container runs as root, so `test-results/` and
`coverage/` on the host may be owned by root; remove them with the same privileges or
from a container.

## Known baseline defects

| Defect | Planned stage |
| --- | --- |
| Password-reset requests store a token but never send the email (TODO); the reset link still targets the API `POST /auth/reset-password` route instead of a client page | T4 |
| Concurrent refreshes with one token race; the loser fails on the missing row | T5 |
| Expired refresh/verification/reset tokens are deleted and then an error is thrown inside the same transaction, so the deletion rolls back (cron cleanup still removes them) | T5 (refresh); others noted |
| `npm run lint` crashes ("object is not iterable"): `eslint.config.mjs` imports `@typescript-eslint/eslint-plugin` instead of `typescript-eslint`, and its legacy `configs.recommended` object cannot be spread into a flat config | Outside the plan; needs approval |

## Verification performed for the harness

- `make test`: 44 passing cases (21 unit, 12 integration, 11 HTTP) on fresh services;
  all nine existing migrations applied to the disposable database.
- `make test-unit`: 21 passing cases without database or Redis containers.
- Negative checks with the built runner image: a deliberately failing test mounted from a
  temporary directory (never added to the repository) exited 1; `--module=no-such-module`
  exited 1; an integration run without `TEST_RESOURCE_OWNER` stopped with
  "Missing isolated resource declaration" before touching services.
- After each run no `express-core-testing` container or volume remained.
- Both CI templates were parsed as YAML and the verify-before-build/deploy ordering was
  checked. The remote pipelines themselves were not executed.
