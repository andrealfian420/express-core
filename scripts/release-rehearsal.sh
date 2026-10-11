#!/bin/sh
# Purpose: Release rehearsal with production images: fresh install of the current working tree,
#   install of an earlier git ref (its own compose file) with data created by it, upgrade,
#   rollback to its image (current compose files, as on a server) and upgrade again. Every step deploys with scripts/deploy.sh (drain before switching versions)
#   and runs the smoke checks of scripts/release-smoke.cjs (API, worker, email via Mailpit).
# Caller: `make release-rehearsal from=<ref>` or `sh scripts/release-rehearsal.sh <ref>`.
# Dependencies: git, Docker with Compose v2.24+, scripts/deploy.sh,
#   scripts/release-rehearsal.compose.yml, scripts/release-smoke.cjs, node:24-slim and
#   axllent/mailpit images.
# Main Functions: use_release, deploy, seed, smoke, cleanup.
# Side Effects: Creates a temporary git worktree, builds express-core-rehearsal:{from,target}
#   images, runs the isolated express-core-rehearsal Compose project with throwaway secrets
#   (never the development .env or volumes); removes all of it on exit.
set -eu

FROM_REF=${1:-}
[ -n "$FROM_REF" ] || { echo 'usage: scripts/release-rehearsal.sh <git ref of the release to upgrade from>' >&2; exit 2; }
ROOT=$(git rev-parse --show-toplevel)
FROM_COMMIT=$(git -C "$ROOT" rev-parse --verify "$FROM_REF^{commit}")
WORK=$(mktemp -d)
FROM_DIR=$WORK/from
STATE=$WORK/state

export COMPOSE_PROJECT_NAME=express-core-rehearsal
export REHEARSAL_ENV_FILE=$WORK/rehearsal.env
export DEPLOY_ENV_FILE=$REHEARSAL_ENV_FILE
export COMPOSE_ENV_FILES=$REHEARSAL_ENV_FILE
export DEPLOY_PULL=false

step() { printf '\n=== %s\n' "$*"; }

cleanup() {
  result=$?
  trap - EXIT
  step 'Cleanup'
  if [ -f "$REHEARSAL_ENV_FILE" ]; then
    docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  git -C "$ROOT" worktree remove --force "$FROM_DIR" >/dev/null 2>&1 || true
  docker image rm express-core-rehearsal:from express-core-rehearsal:target >/dev/null 2>&1 || true
  case $WORK in "${TMPDIR:-/tmp}"/*) rm -rf "$WORK" ;; esac
  [ "$result" = 0 ] && echo 'Release rehearsal passed' || echo "Release rehearsal FAILED (exit $result)" >&2
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Selects the release whose own docker-compose.yml and image the next steps use.
use_release() {
  RELEASE_DIR=$1
  export IMAGE_TAG=$2
  export COMPOSE_FILE="$RELEASE_DIR/docker-compose.yml:$ROOT/scripts/release-rehearsal.compose.yml"
}

deploy() { (cd "$RELEASE_DIR" && DEPLOY_DRAIN=${1:-false} sh "$ROOT/scripts/deploy.sh"); }

seed() { docker compose run --rm --no-deps -T api node prisma/seed.js; }

# Rate-limit counters are per client IP; clear them so one phase's requests never count
# against the next (each phase stays within the production limits by itself).
smoke() {
  docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EVAL \
    "for _, k in ipairs(redis.call('KEYS', 'rl:*')) do redis.call('DEL', k) end return 0" 0 >/dev/null
  docker run --rm --network express-core-rehearsal --user "$(id -u):$(id -g)" \
    -v "$ROOT/scripts/release-smoke.cjs:/smoke/release-smoke.cjs:ro" -v "$STATE:/state" \
    -e API_URL=http://api:3001 -e MAILPIT_URL=http://mailpit:8025 \
    -e ORIGIN=http://client.rehearsal.test -e STATE_FILE=/state/state.json \
    node:24-slim node /smoke/release-smoke.cjs "$1"
}

secret() { od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'; }

step "Prepare: $FROM_REF ($FROM_COMMIT) → working tree"
mkdir -p "$STATE"
DB_PASSWORD=$(secret 16)
REDIS_PASSWORD=$(secret 16)
# Settings for both releases; each reads the names it knows. Values are throwaway. ENABLELOG
# stays empty: releases before 3.0 treat any value (even "false") as on and then write request
# logs into the read-only image, which crashes their API.
cat >"$REHEARSAL_ENV_FILE" <<EOF
APP_NAME="Express Core Rehearsal"
APP_URL=http://api:3001
NODE_ENV=production
PORT=3001
ENABLECORS=false
ENABLEHELMET=true
FORMLIMIT=52428800
ENABLELOG=
LOG_TO_FILES=false
DATABASE_URL=postgresql://rehearsal:$DB_PASSWORD@postgres:5432/rehearsal?schema=public
DB_USER=rehearsal
DB_PASSWORD=$DB_PASSWORD
DB_NAME=rehearsal
JWT_ACCESS_SECRET=$(secret 48)
JWT_ACCESS_EXPIRES=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
EMAIL_VERIFICATION_EXPIRES_HOURS=24
PASSWORD_RESET_EXPIRES_MINUTES=30
BCRYPT_ROUNDS=10
PASSWORD_RESET_URL=http://client.rehearsal.test/reset-password
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=rehearsal
SMTP_PASS=rehearsal
SMTP_FROM="Express Core Rehearsal <noreply@rehearsal.test>"
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$REDIS_PASSWORD
ALLOWED_ORIGINS=http://client.rehearsal.test
EOF
set -a
. "$REHEARSAL_ENV_FILE"
set +a

git -C "$ROOT" worktree add --detach "$FROM_DIR" "$FROM_COMMIT" >/dev/null
docker build --quiet --target production -t express-core-rehearsal:from "$FROM_DIR" >/dev/null
docker build --quiet --target production -t express-core-rehearsal:target "$ROOT" >/dev/null
use_release "$ROOT" target
docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true

step 'Fresh install of the working tree'
deploy
seed
smoke fresh
docker compose down --volumes --remove-orphans >/dev/null

step "Install $FROM_REF and create data with it"
use_release "$FROM_DIR" from
deploy
seed
smoke baseline

step "Upgrade $FROM_REF → working tree (drain, migrate, seed again)"
use_release "$ROOT" target
deploy true
seed
smoke upgraded

# A rollback keeps the server's current compose files and redeploys the older image.
step "Roll back to the $FROM_REF image on the upgraded database"
use_release "$ROOT" from
deploy true
smoke rolledback

step 'Upgrade to the working tree again'
use_release "$ROOT" target
deploy true
smoke reupgraded
