# Production image: one container serving the API, the MCP endpoint and the built SPA.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @artifact-hub/shared build \
 && pnpm --filter @artifact-hub/web build \
 && pnpm --filter @artifact-hub/api build
# Standalone API directory with production dependencies only (workspace packages copied in).
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @artifact-hub/api deploy --prod --legacy /out/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/web \
    STORAGE_LOCAL_ROOT=/data/blobs
WORKDIR /app
# Mount a volume at /data (Railway Volume) so blobs survive redeploys.
RUN mkdir -p /data/blobs && chown -R node:node /data
COPY --from=build --chown=node:node /out/api ./
COPY --from=build --chown=node:node /app/apps/web/dist ./web
USER node
EXPOSE 3000
# Apply pending migrations, then start the server.
CMD ["sh", "-c", "node dist/database/migrate.js && exec node dist/main.js"]
