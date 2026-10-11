<!-- Purpose: Release, deploy, upgrade and rollback procedure, including the 2.x → 3.0 upgrade.
Caller: Maintainers and operators of projects built on Express Core; API client developers.
Dependencies: scripts/deploy.sh, scripts/release-rehearsal.sh, docker-compose*.yml, the CI templates, CHANGELOG.md.
Main Functions: Release procedure, deploy options, drain and failure handling, 2.x → 3.0 upgrade and rollback.
Side Effects: None; documentation only. -->
# Upgrading

What changed in each release is in [CHANGELOG.md](../CHANGELOG.md). This guide covers how to
release, deploy and roll back, then the specific steps for 2.x → 3.0.

## Release procedure

1. **Verify.** The CI verify step must pass: build, the full test suite with the migration
   drift check, and the coverage report.
2. **Rehearse.** Run `make release-rehearsal from=<previous release tag or commit>`. It
   builds production images of that ref and of your working tree, then runs them in an
   isolated Compose project with throwaway secrets and Mailpit as the SMTP server. It checks:
   - a fresh install;
   - an install of the older release, with data created by it;
   - the upgrade (drain, migrate, seed);
   - a rollback onto the upgraded database (the older image with the current compose files,
     as on a server);
   - a second upgrade.

   Every step deploys with `scripts/deploy.sh` and runs smoke checks: readiness, logins,
   refresh sessions across versions, RBAC, and registration and reset emails delivered by the
   worker. Nothing touches your development stack, `.env` or volumes, and everything is
   removed afterwards. It does not cover your real configuration, data volume, mail provider
   or network.
3. **Staging.** Smoke-test the image on your own staging environment (API, worker, one real
   email).
4. **Back up** the database before any release that contains migrations.
5. **Deploy.** A push to `main` makes CI build the image, tag it with the full commit SHA and
   deploy exactly that tag. To deploy by hand, run this in the deploy directory on the server:

   ```bash
   IMAGE_TAG=<commit sha> DEPLOY_DRAIN=true sh scripts/deploy.sh
   ```

   CI pipes the script over SSH, so the server needs only the compose files and `.env`. For a
   manual run, copy the script there or pipe it the same way:
   `ssh host "cd /opt/app && IMAGE_TAG=<sha> DEPLOY_DRAIN=true sh -s" < scripts/deploy.sh`.
6. **Roll back** by deploying an earlier tag:
   - GitHub: re-run the deploy job of the last good run.
   - Bitbucket: redeploy an earlier deployment.
   - By hand: run `scripts/deploy.sh` with the earlier `IMAGE_TAG`.

   The database is not rolled back, so this works only while schema changes are additive. Read
   the release's rollback notes first.

### `scripts/deploy.sh`

| Variable | Default | Meaning |
| --- | --- | --- |
| `IMAGE_TAG` | required | Image tag for `api`, `worker` and `migrate` (`docker-compose.prod.yml` uses `${IMAGE_TAG:-latest}`) |
| `DEPLOY_DRAIN` | `false` | Stop the API, wait until the outbox and queues are empty, stop the worker, then deploy |
| `DEPLOY_PULL` | `true` | Pull images first (before the drain, to keep the API downtime short) |
| `DEPLOY_TIMEOUT_SECONDS` | `180` | Limit for the drain and for each health check |
| `DEPLOY_ENV_FILE` | `.env` | Settings read for the drain (`DB_USER`, `DB_NAME`, `REDIS_PASSWORD`) |
| `COMPOSE_FILE` | `docker-compose.yml:docker-compose.prod.yml` | Compose files to use |

The script pulls images, drains if asked, then runs `docker compose up -d`. The one-shot
`migrate` service applies pending migrations, and the API and worker start only after it
succeeds. The script prints the migration output and waits until both the API and the worker
report healthy; otherwise it prints the container status and logs and exits non-zero.

- **Drain:** the CI templates always drain. While draining, the API is stopped, so requests fail
  until the new API is healthy. Draining guarantees that a worker never receives jobs written
  by another version, and that no outbox intent is left behind for a worker that cannot read
  it.
- **Drain timeout:** nothing is deployed and the API stays stopped. Restart the running release
  (`IMAGE_TAG=<current sha> sh scripts/deploy.sh`) or inspect the outbox and dead letters first.
- **Failed migration:** the API and worker are not started. Prisma then refuses every later
  `migrate deploy`, including the previous release's, until the failed migration is resolved
  (`npx prisma migrate resolve`) or the backup is restored.

## 2.x → 3.0

The upgrade from 2.0.0 (`e203408`) was rehearsed with `make release-rehearsal from=e203408`:
upgrade, rollback and re-upgrade all passed. All five new migrations are additive:
`outbox` + `dead_letter_jobs`, refresh-token families, `email_otps`, `email_templates` and
`user_profiles`.

### Before you start

- Rehearse from the commit you run in production. Back up the database.
- Ship the client changes below together with the API, or before it where they are
  backwards compatible.

### Configuration (`.env`)

- **Add `PASSWORD_RESET_URL`:** the client page that receives `?token=` from the reset email.
  The API refuses to start without it.
- **Production secret:** `JWT_ACCESS_SECRET` must have at least 32 characters and must not be
  the `.env.example` placeholder.
- **`JWT_ACCESS_EXPIRES`:** needs a unit (`15m`, not `900`).
- **Flags:** only `true`/`false`/`1`/`0`/`yes`/`no`/`on`/`off`. Invalid values stop the API and
  worker at startup with the variable named.
- **`ENABLELOG`:** keep it empty or `false` while a rollback to 2.x is possible. 2.x treats any
  value (even `false`) as on, and then crashes on the read-only container while writing
  request logs.
- **Optional settings with defaults:** `REFRESH_GRACE_SECONDS`, `REGISTRATION_VERIFICATION`,
  `REGISTRATION_DEFAULT_ROLE`, `OTP_*`, `SUPPORTED_LOCALES`, `MAIL_DRIVER` / `ZEPTOMAIL_*`,
  `OUTBOX_*`, `DLQ_RETENTION_DAYS`, `LOG_TO_FILES`. See the README environment section.

### Server and CI files

- Replace `docker-compose.yml` with the 3.0 file. Update `docker-compose.prod.yml` from its
  `.example`: the images use `${IMAGE_TAG:-latest}`.
- Update your CI file from the 3.0 template. It runs the drift check, tags images with the full
  SHA and deploys through `scripts/deploy.sh`.
- The worker service must run: it sends all email and runs the maintenance schedule.

### Client changes

- Identify users by `slug`. Single-user payloads no longer contain `id` or `roleId`.
- Browser apps must be served from an origin listed in `ALLOWED_ORIGINS`, or login, refresh
  and logout answer `403`.
- Build the reset page at `PASSWORD_RESET_URL`. It reads `token` and posts it with the new
  password to `/auth/reset-password`.
- Show the field details in `errors` for 4xx responses. Do not rely on 5xx messages.
- Refreshing in parallel is safe. Presenting an old refresh token again after the grace window
  logs that device out.
- In the role editor, offer `userType` values from `GET /roles/user-types`.

### Deploy

1. Deploy the 3.0 image with the drain: through CI, or by hand with
   `IMAGE_TAG=<sha> DEPLOY_DRAIN=true sh scripts/deploy.sh`.
2. Run the seeders once. This grants the email-template permissions to `super-admin` and
   creates the four templates. It leaves the admin account, other roles and edited templates
   alone:

   ```bash
   IMAGE_TAG=<sha> docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     run --rm --no-deps api node prisma/seed.js
   ```

3. Check `GET /api/v1/health/ready`, log in, and request a password reset for your own account
   to see an email leave through the worker.

### What carries over

- **Sessions:** refresh tokens issued by 2.x keep working, and access tokens stay valid until
  they expire.
- **Roles and users:** unchanged. Roles whose `userType` is not in the catalogue keep their
  permissions and can be edited, but `checkUserType` never admits them.
- **Profile cache:** for users whose profile 2.x had cached, `GET /profile` can omit the new
  `profile` field for up to 15 minutes.
- **Rate limits:** old counters (`rl:<ip>`) expire within an hour; new ones use `rl:<name>:<ip>`.

### Rolling back to 2.x

The 2.x CI template deploys the `latest` tag, so re-running an old 2.x pipeline would pull the
3.0 image again. Roll back with the 3.0 script and the 2.x image's SHA tag instead:

```bash
IMAGE_TAG=<2.x image tag> DEPLOY_DRAIN=true sh scripts/deploy.sh
```

- Set `ENABLELOG=` (empty) first (see above).
- The drain lets the 3.0 worker finish the outbox, because 2.x cannot read it.
- The 2.x `migrate deploy` ignores the newer migrations and exits successfully.
- **Never run the 2.x seeder on a 3.0 database.** It resets the admin password to `password`
  and replaces the `super-admin` permissions.
- **While on 2.x:**
  - 3.0 data (profiles, templates, OTP rows, outbox history) stays in place and is used again
    after re-upgrading.
  - OTP registration, templates and profile details are unavailable.
  - Sessions issued by 3.0 keep working.
- **Re-upgrade:** deploy the 3.0 tag again with the drain. The migrations are already applied.
