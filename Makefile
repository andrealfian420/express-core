.PHONY: dev prod build migrate seed logs down clean

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
