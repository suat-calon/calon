# =============================================================================
# CALON API — PRODUCTION DOCKERFILE
# Multi-stage build: builder → runner
# Strategy: CONTAINER_BUILD_STRATEGY.md
# Target image size: < 200 MB
# =============================================================================

# ─── STAGE 1: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine3.19 AS builder

WORKDIR /app

# Copy workspace manifests first — maximises layer cache reuse
COPY package.json yarn.lock            ./
COPY apps/api/package.json             apps/api/
COPY packages/database/package.json   packages/database/

# Install all dependencies (devDependencies required for tsc + prisma generate)
RUN yarn install --frozen-lockfile

# Copy source files
COPY tsconfig.base.json                ./
COPY apps/api/                         apps/api/
COPY packages/database/prisma/         packages/database/prisma/
COPY packages/database/src/            packages/database/src/
COPY packages/database/tsconfig.json   packages/database/

# Generate Prisma client to custom output (packages/database/generated/client)
# binaryTarget linux-musl-openssl-3.0.x is declared in schema.prisma for Alpine
RUN yarn workspace @calon/database prisma generate

# Also generate into standard .prisma/client for @prisma/client import resolution.
# Custom output does NOT auto-populate .prisma/client in Prisma v6.
# Create temp schema without custom output to generate into default location.
RUN sed '/output/d' packages/database/prisma/schema.prisma > packages/database/prisma/schema_std.prisma \
    && npx prisma generate --schema packages/database/prisma/schema_std.prisma \
    && rm packages/database/prisma/schema_std.prisma

# Build @calon/database — produces packages/database/dist/ (ORM boundary layer)
RUN yarn workspace @calon/database build

# Compile TypeScript → apps/api/dist/
RUN yarn workspace @calon/api build


# ─── STAGE 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine3.19 AS runner

# Build-time metadata — injected by CI pipeline:
#   docker build --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
#                --build-arg BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) ...
ARG GIT_COMMIT=unknown
ARG BUILD_TIME=unknown

WORKDIR /app

ENV NODE_ENV=production
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_TIME=$BUILD_TIME

# Create dedicated non-root system user
RUN addgroup -S calon && adduser -S calon -G calon

# Copy workspace manifests for production dependency install
COPY package.json yarn.lock            ./
COPY apps/api/package.json             apps/api/
COPY packages/database/package.json   packages/database/

# Install production dependencies only — no devDependencies, no build tools
RUN yarn install --frozen-lockfile --production \
    && yarn cache clean

# Copy compiled API output from builder
COPY --from=builder /app/apps/api/dist          apps/api/dist/

# Copy tsconfig files — required by tsconfig-paths/register at runtime
# tsconfig-paths resolves @prisma/client → packages/database/generated/client
COPY --from=builder /app/apps/api/tsconfig.json apps/api/tsconfig.json
COPY --from=builder /app/tsconfig.base.json     tsconfig.base.json

# Copy @calon/database compiled output — ORM boundary layer (Money, errors, types)
COPY --from=builder /app/packages/database/dist/ packages/database/dist/

# Copy Prisma schema — required for prisma migrate deploy at startup
COPY --from=builder /app/packages/database/prisma/ packages/database/prisma/

# Copy Prisma generated client (custom output) — used by @calon/database
COPY --from=builder /app/packages/database/generated/client \
                        packages/database/generated/client/

# Copy standard Prisma client — used by @prisma/client import resolution chain
COPY --from=builder /app/node_modules/.prisma/client \
                        node_modules/.prisma/client/

# Switch to non-root user — root is forbidden in production containers
USER calon

# API listens on 4000 (matches PORT default in env.validation.ts)
EXPOSE 4000

# Container healthcheck — orchestrators gate traffic until this passes
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:4000/api/v1/health || exit 1

# Run from apps/api so tsconfig-paths/register finds tsconfig.json in cwd
WORKDIR /app/apps/api

# Entrypoint — API server only, no migrations, no queue processors
CMD ["node", "dist/main.js"]
