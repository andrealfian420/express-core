#!/bin/sh
# Purpose: Run Docker test suites with cleanup that preserves the failure status.
# Caller: Makefile testing targets (make test, test-unit, test-integration, test-http, test-watch).
# Dependencies: Docker Compose and docker-compose.test.yml.
# Main Functions: compose, cleanup.
# Side Effects: Builds the runner image, creates/removes test containers and volumes,
#   writes test-results/ and coverage/ reports.
set -eu
suite=${1:-ci}
module=${2:-}
compose() { docker compose --env-file /dev/null -p express-core-testing -f docker-compose.test.yml "$@"; }
cleanup() { result=$?; trap - EXIT; compose down --volumes --remove-orphans || true; exit "$result"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p test-results coverage
compose build runner
case "$suite" in unit|watch) ;; *) compose up -d --wait postgres redis ;; esac
if [ -n "$module" ]; then
  compose run --rm --no-deps runner node scripts/test-runner.cjs "$suite" "--module=$module"
else
  compose run --rm --no-deps runner node scripts/test-runner.cjs "$suite"
fi
