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

# Generate Prisma client
# binaryTarget linux-musl-openssl-3.0.x is declared in schema.prisma for Alpine
RUN yarn workspace @calon/database prisma generate

# Compile TypeScript → apps/api/dist/
RUN yarn workspace @calon/api build


# ─── STAGE 2: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine3.19 AS runner

WORKDIR /app

ENV NODE_ENV=production

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

# Copy Prisma generated client — contains linux-musl-openssl-3.0.x query engine
COPY --from=builder /app/packages/database/generated/client \
                        packages/database/generated/client/

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
