# Purpose: Developer convenience wrapper around Docker Compose commands.
# Caller: Developers, invoked directly (e.g. `make dev`, `make test module=auth`).
# Dependencies: docker-compose*.yml, isolated docker-compose.test.yml, scripts/test-compose.sh.
# Main Functions: dev, prod, build, migrate, seed, logs, down, clean, shell, studio,
#   test, test-unit, test-watch, test-integration, test-http, test-down.
# Side Effects: Starts/stops Docker containers; migrate/seed write to the development DB;
#   test targets use only the disposable express-core-testing Compose project.
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

# Automated tests (isolated stack; safe while the development stack is running).
# Usage: make test | make test-unit module=auth | make test-down
.PHONY: test test-unit test-watch test-integration test-http test-down
test:
	sh scripts/test-compose.sh ci $(module)
test-unit:
	sh scripts/test-compose.sh unit $(module)
test-watch:
	sh scripts/test-compose.sh watch $(module)
test-integration:
	sh scripts/test-compose.sh integration $(module)
test-http:
	sh scripts/test-compose.sh http $(module)
test-down:
	docker compose --env-file /dev/null -p express-core-testing -f docker-compose.test.yml down --volumes --remove-orphans
