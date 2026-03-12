# CALON CONTAINER BUILD STRATEGY

This document defines the container image build principles for the Calon API and Worker services.

Purpose: Produce minimal, secure, deterministic production images.

---

# BUILD APPROACH

All Calon service images use a **multi-stage Docker build**.

Two stages:

```
builder  →  compiles the application
runner   →  runs the compiled application
```

**Why multi-stage:**

The builder stage installs all dependencies including devDependencies, compiles TypeScript, and generates Prisma client. These tools are not needed at runtime. The runner stage copies only the compiled output and production dependencies, resulting in a significantly smaller and more secure image.

---

# BUILDER STAGE

Base image: `node:20-alpine`

The builder stage performs:

1. Install all dependencies (including devDependencies)
2. Run Prisma generate — produces the typed database client
3. Compile TypeScript — produces `dist/`

Output artifacts passed to runner stage:

```
dist/
node_modules/       (production only — reinstalled in runner)
packages/database/generated/client/
```

Build commands in order:

```
npm ci
npx prisma generate
npm run build
```

The builder stage must not be shipped in the final image.

---

# RUNNER STAGE

Base image: `node:20-alpine`

The runner stage:

- Copies `dist/` from the builder stage
- Copies `packages/database/generated/client/` from the builder stage
- Installs **production dependencies only**

```
npm ci --omit=dev
```

- Sets `NODE_ENV=production`
- Runs as a **non-root user**

```
RUN addgroup -S calon && adduser -S calon -G calon
USER calon
```

The runner stage contains no TypeScript compiler, no test framework, no devDependencies. Only what is required to run the application in production.

---

# ENTRYPOINT RULES

## API Service

```
node dist/main.js
```

The API entrypoint starts the NestJS HTTP server. It must not run migrations. It must not start background processors.

## Worker Service

```
node dist/worker.js
```

The Worker entrypoint starts BullMQ processors, outbox dispatcher, and recovery workers. It must not start an HTTP server.

Each service has a dedicated entrypoint. A single image may support both entrypoints via a build argument or separate Dockerfiles. The entrypoint is determined at container runtime, not at image build time.

---

# IMAGE SECURITY

The following rules apply to all Calon container images:

**No root user**
The container must not run as root. A dedicated non-root system user must be created and used as the runtime user. Running as root inside a container grants unnecessary privilege and increases attack surface.

**No secrets in image**
Environment variables, API keys, database credentials, and JWT secrets must never be baked into the image at build time. All secrets are injected at container runtime through the deployment platform's environment configuration.

**No mutable filesystem dependency**
The application must not write to or read from the container's local filesystem for any persistent data. Container filesystems are ephemeral. All persistence must use PostgreSQL or Redis.

**No unnecessary tools**
The runner stage must not include build tools, shells beyond minimal system requirements, or package managers used only during build.

---

# HEALTHCHECK STRATEGY

## API Container

The Docker healthcheck for the API container must verify HTTP readiness:

```
GET /api/v1/health → HTTP 200
```

Docker healthcheck configuration:

```
interval: 10s
timeout:  5s
retries:  5
start_period: 30s
```

The health endpoint must return 200 only when the application is fully initialized and ready to serve traffic. It must return a non-200 status during startup or when a critical dependency is unreachable.

## Worker Container

The Worker does not expose an HTTP port. Worker liveness is verified through:

- Queue heartbeat log — the Worker emits a log entry at regular intervals confirming it is processing
- BullMQ job processing activity — stalled job detection via Redis

A future improvement may expose a minimal HTTP health port on the Worker for orchestrator compatibility.

---

# IMAGE SIZE GOAL

Target final image size:

```
< 200 MB
```

Size reduction strategies:

- Alpine base image (node:20-alpine vs node:20 saves ~400 MB)
- Multi-stage build eliminates devDependencies and TypeScript compiler
- `.dockerignore` excludes: `node_modules/`, `.git/`, `dist/`, test files, documentation

Expected size breakdown:

```
node:20-alpine base     ~60 MB
production node_modules ~80-120 MB
dist/ compiled output   ~5-10 MB
prisma client           ~10-15 MB
─────────────────────────────────
Total target            ~155-205 MB
```
