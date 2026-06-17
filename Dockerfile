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

EXPOSE 3000

CMD ["node", "dist/server.js"]
