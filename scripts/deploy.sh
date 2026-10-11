#!/bin/sh
# Purpose: Deploy one image tag with Docker Compose and wait until it is healthy: pull,
#   optionally drain (stop the API, let the worker finish the outbox and queued jobs, stop the
#   worker), run the one-shot migrate service, recreate the API and worker, then require both
#   health checks to pass. Deploying an earlier tag is the rollback.
# Caller: CI deploy steps (piped over SSH: `IMAGE_TAG=<sha> sh -s < scripts/deploy.sh`),
#   operators for a manual deploy or rollback, scripts/release-rehearsal.sh.
# Dependencies: Docker Compose v2.24+, docker-compose.yml + docker-compose.prod.yml (images
#   tagged ${IMAGE_TAG}) unless COMPOSE_FILE says otherwise, the project's .env (DB_USER,
#   DB_NAME, REDIS_PASSWORD for the drain).
# Main Functions: compose, drain, wait_healthy, fail.
# Side Effects: Pulls images, applies migrations, stops and recreates containers; the drain
#   stops the API (requests fail until the new API is healthy).
# Usage: IMAGE_TAG=<tag> [DEPLOY_DRAIN=true] [DEPLOY_PULL=false] sh scripts/deploy.sh
set -eu

: "${IMAGE_TAG:?IMAGE_TAG must name the image tag to deploy (the commit SHA)}"
export IMAGE_TAG
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml:docker-compose.prod.yml}"
ENV_FILE=${DEPLOY_ENV_FILE:-.env}
TIMEOUT=${DEPLOY_TIMEOUT_SECONDS:-180}

# `.` searches PATH for a bare file name, so make it a path.
case $ENV_FILE in */*) ;; *) ENV_FILE=./$ENV_FILE ;; esac
if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

compose() { docker compose "$@"; }

fail() {
  echo "Deploy of $IMAGE_TAG failed: $1" >&2
  compose ps -a >&2 || true
  compose logs --tail 30 migrate api worker >&2 || true
  exit 1
}

# Health of a service's container: healthy, starting, unhealthy, or empty when absent.
health() {
  container=$(compose ps -q "$1" 2>/dev/null || true)
  [ -n "$container" ] || return 0
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true
}

wait_healthy() {
  waited=0
  until [ "$(health "$1")" = healthy ]; do
    [ "$waited" -lt "$TIMEOUT" ] || fail "$1 is not healthy after ${TIMEOUT}s"
    sleep 5
    waited=$((waited + 5))
  done
  echo "$1 is healthy"
}

# Work still waiting in the outbox and the BullMQ queues (an old worker must not receive jobs
# it does not know, and a new one must not lose intents written by the old API).
sql() { compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1"; }

pending_work() {
  # Releases before the outbox have no table to wait for.
  rows=0
  if [ "$(sql "SELECT to_regclass('public.outbox') IS NOT NULL")" = t ]; then
    rows=$(sql "SELECT count(*) FROM outbox WHERE status = 'PENDING'")
  fi
  jobs=$(compose exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning EVAL "
    local n = 0
    for _, q in ipairs(ARGV) do
      local k = 'bull:' .. q .. ':'
      n = n + redis.call('LLEN', k .. 'wait') + redis.call('LLEN', k .. 'active')
        + redis.call('LLEN', k .. 'paused') + redis.call('ZCARD', k .. 'delayed')
        + redis.call('ZCARD', k .. 'prioritized')
    end
    return n" 0 email system)
  echo $((rows + jobs))
}

drain() {
  if [ -z "$(compose ps -q worker 2>/dev/null || true)" ]; then
    echo 'Nothing running; no drain needed'
    return 0
  fi
  echo 'Draining: stopping the API so no new work is produced'
  compose stop api
  waited=0
  until [ "$(pending_work)" = 0 ]; do
    [ "$waited" -lt "$TIMEOUT" ] || fail "outbox or queues still hold work after ${TIMEOUT}s"
    sleep 2
    waited=$((waited + 2))
  done
  compose stop worker
  echo 'Drained: outbox and queues are empty'
}

# Pull before draining so the API is down only for the drain, migration and start.
[ "${DEPLOY_PULL:-true}" = true ] && compose pull --quiet
[ "${DEPLOY_DRAIN:-false}" = true ] && drain

# migrate runs first; the API and worker start only after it completed successfully.
compose up -d || fail 'docker compose up failed (see the migrate output above)'
echo 'Migrations:'
compose logs --no-color --no-log-prefix migrate 2>/dev/null | grep -i 'migration\|applied\|pending' || true
wait_healthy api
wait_healthy worker
echo "Deployed $IMAGE_TAG"
