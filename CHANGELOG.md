<!-- Purpose: Record user-visible changes per release, breaking changes first.
Caller: Maintainers, API client developers and operators upgrading a project built on Express Core.
Dependencies: Git history; docs/upgrading.md holds the step-by-step upgrade and rollback procedure.
Main Functions: One section per release (Breaking, Added, Changed, Fixed).
Side Effects: None; documentation only. -->
# Changelog

Notable changes to Express Core. Versions follow [Semantic Versioning](https://semver.org/).
Upgrade and rollback steps live in [docs/upgrading.md](docs/upgrading.md).

## Unreleased

### Added

- `GET /users/:slug` returns the user's `role` (`id`, `slug`, `title`), so admin clients can
  preselect it when editing. `roleId` stays out of single-user payloads.

### Fixed

- `avatarUrl` contained `//` (`/storage//uploads/avatars/...`), which path-based allowlists
  such as Next.js `images.remotePatterns` reject. It is now `/storage/uploads/avatars/...`;
  both forms keep serving the file.

## 3.0.0 - 2026-10-11

Hardens 2.0.0 for production (verified delivery, safe sessions, strict configuration, tests and
a release rehearsal) and adds opt-in modules. All schema changes are additive: 2.0.0 still runs
on a 3.0.0 database, so a rollback needs no database restore.

### Breaking

- **User payloads:** responses of register, user create/update/show and profile no longer
  contain `password`, `id`, `roleId` or `deletedAt`; `slug` identifies a user. The paginated
  `GET /users` list still returns `id` and the nested role.
- **Cookie endpoints:** `POST /auth/login`, `/auth/refresh` and `/auth/logout` reject requests
  whose `Origin` (or `Referer`) is not in `ALLOWED_ORIGINS` (`403`). Rejected CORS origins also
  answer `403`.
- **Sessions:**
  - Logout ends the whole session family (that device), and a password reset ends every
    session.
  - Reusing a rotated refresh token after `REFRESH_GRACE_SECONDS` (default 30) ends that
    family.
  - Deleting a user ends their sessions.
- **Password reset email:** links point to the new required `PASSWORD_RESET_URL` (your client
  page, receiving `?token=`), not to the API.
- **Error envelope:**
  - `errors` (field details) is returned on every `4xx` in every environment.
  - Unexpected server errors answer `Internal Server Error` outside development.
  - Rejected uploads answer `400` (type or extension) or `413` (size) instead of `500`.
- **Roles:** `userType` must be one of `USER_TYPES` (`Administrator`, `Member`); other values
  answer `400`. Roles saved earlier with another type keep working.
- **Configuration:** the API and worker refuse to start with invalid settings.
  - Required: `APP_URL`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `PASSWORD_RESET_URL`.
  - `JWT_ACCESS_EXPIRES` needs a unit.
  - Flags take only true/false values (`ENABLELOG=false` now really disables logging).
  - In production, `JWT_ACCESS_SECRET` must have 32+ characters and must not be the example
    placeholder.
- **Worker required:** the worker now runs the scheduled maintenance (cron moved out of the
  API) and delivers every email through the outbox. Without a running worker, no email is
  sent.
- **Logging:** logs go to stdout (JSON in production). Files are written only with
  `LOG_TO_FILES=true`.
- **Seeders:** the seeders are now named TypeScript modules. Rerunning them only adds missing
  super-admin permissions and templates, and never resets the admin account.

### Added

- Transactional outbox for emails: intents commit with the business write, and the worker relay
  publishes them with a lease, retries and backoff. Final failures go to `dead_letter_jobs`, and
  a once-only re-drive CLI is available (`npm run dlq:redrive`).
- Opt-in registration by email code: `REGISTRATION_VERIFICATION=otp`, with `/auth/send-otp` and
  `/auth/verify-otp`. `REGISTRATION_DEFAULT_ROLE` assigns a role to self-registered users.
- Admin-editable email templates for the four transactional emails, with built-in fallbacks:
  `GET /email-templates`, `GET/PUT /email-templates/:key`.
- ZeptoMail mail driver (`MAIL_DRIVER=zeptomail`).
- Optional profile details on `PUT /profile`: phone, birth date, gender and locale
  (`SUPPORTED_LOCALES`).
- `checkUserType(...)` route gate and `GET /roles/user-types`.
- Paginator: relational search paths, default sort and a stable `id` tie-breaker.
- Automated test suites (`make test`) with coverage and a migration drift check, wired into the
  CI templates as a gate before build and deploy.
- `scripts/deploy.sh` (deploy one image tag: drain, migrate, start, wait for health) and
  `make release-rehearsal from=<ref>` (fresh install, upgrade, rollback and re-upgrade with
  production images).

### Changed

- Refresh tokens rotate safely under concurrency: parallel refreshes receive the same
  successor.
- RBAC cache entries are versioned, so role and user changes apply on the next request.
- CI templates tag images with the full commit SHA and deploy exactly that tag
  (`IMAGE_TAG`). A deploy waits for the API and worker health checks, and a rollback
  redeploys an earlier tag.
- `docker-compose.prod.yml.example` images use `${IMAGE_TAG:-latest}`.
- The API health check uses Node instead of `wget`. Graceful shutdown releases the queues,
  database, Redis and timers.

### Fixed

- Create/update user responses exposed the password hash.
- Registration did not send the verification email (missing token).
- Password reset emails were never sent.
- Verification links duplicated the port.
- Every rate limiter shared one Redis counter per IP, so ordinary API traffic used up the login
  limit; each limiter now counts under `rl:<name>:`.
- Parallel refreshes with the same token failed for all but one request.
- Logout failed when Redis was unavailable.
- Deleting a role did not await cache invalidation, which hid failures.
- A stale RBAC cache could keep removed permissions for up to 5 minutes.
- Expired-token cleanup inside a transaction was rolled back by the error it raised.
- With `ENABLELOG` set, the production API crashed on the read-only container while writing
  request logs into the image.

## 2.0.0

Baseline release (`e203408`). No changelog was kept before 3.0.0.
