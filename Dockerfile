# syntax=docker/dockerfile:1

# Production image: Next.js standalone server plus a bundled migration runner.
# glibc (bookworm) rather than Alpine so prebuilt native optional deps work.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    NEXT_TELEMETRY_DISABLED=1
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Optional dependencies stay in: they carry the platform's native binaries.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:migrate

# The runtime is plain Debian (same release and glibc as the Node image) plus only the `node`
# binary: no npm, yarn, corepack or C headers, which a layer above the Node image could only
# hide, not remove (~55 MB smaller).
FROM debian:bookworm-slim AS runtime
COPY --from=base /usr/local/bin/node /usr/local/bin/node
# curl is for the orchestrator's health check (`curl -f .../api/health`). `node` (uid 1000)
# matches the official image's unprivileged user.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1000 node \
    && useradd --uid 1000 --gid node --shell /bin/sh --create-home node
# Declared after the apt layer so a new commit doesn't invalidate it.
ARG COMMIT=unknown
LABEL org.opencontainers.image.source="https://github.com/denniskasper/my-notebook" \
      org.opencontainers.image.revision="${COMMIT}" \
      org.opencontainers.image.description="NotebookLM clone: Next.js app with Postgres"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    COMMIT=${COMMIT}
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# The unprivileged `node` user created above (uid 1000).
USER node
EXPOSE 3000
# Migrate under the advisory lock, then hand PID 1 to the server so it gets SIGTERM.
CMD ["sh", "-c", "node migrate.mjs && exec node server.js"]
