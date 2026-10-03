# Artifact Hub

Publish, browse, review and share AI-generated content (HTML, SVG, images, PDFs, Markdown) from a web UI or any MCP client. See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Stack

pnpm workspace: `apps/api` (NestJS 12, TypeORM, Postgres), `apps/web` (React + Vite, Tailwind, shadcn/ui), `packages/shared` (zod schemas, error codes). Node 22, ESM throughout.

## Local development

Both options serve the web app on http://localhost:5173 (proxying `/api` and `/mcp`), the API on :3000 and Postgres 16 on :5432, all with hot reload. They use the same ports, so run one at a time.

**Fully containerized** (only Docker and Node with pnpm needed, works the same on every machine):

```sh
pnpm dev:docker         # Ctrl+C stops it
pnpm dev:docker:down    # remove the containers (the database stays in its volume)
```

Three containers: `postgres`, `api` (builds `packages/shared`, applies migrations, then runs Nest and the shared package in watch mode) and `web` (Vite). Dependencies are installed into the dev image at build time, never on the host; the source is mounted for hot reload.

**On the host** (faster tooling, needs `pnpm install` locally):

```sh
pnpm install
pnpm dev    # starts Postgres in Docker, applies migrations, then runs shared, api and web in watch mode
```

The API's development defaults match docker-compose; to override them, copy `apps/api/.env.example` to `apps/api/.env`. If you run Postgres yourself, `pnpm dev:apps` skips the Docker step.

| Command                                        |                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Static checks (tsc, oxlint, prettier)                                                                                                      |
| `pnpm test`                                    | Unit tests (vitest)                                                                                                                        |
| `pnpm test:e2e`                                | API e2e tests against `artifact_hub_test` (needs the compose Postgres, `docker compose up -d postgres`; override with `TEST_DATABASE_URL`) |
| `pnpm db:migrate`                              | Apply pending migrations                                                                                                                   |

### Migrations

The schema changes only through migrations (`synchronize: false`). From `apps/api`:

- `pnpm db:migration:generate src/database/migrations/AddUsers` diffs entities against the database, or `pnpm db:migration:create src/database/migrations/AddUsers` for an empty one.
- Register the new class at the end of `src/database/migrations/index.ts` (migrations are listed explicitly, not globbed).
- `pnpm db:migration:revert` undoes the last one.

## Production image

`docker/Dockerfile` builds the shared package, the SPA and the API into one image that runs as a non-root user, applies migrations on start and serves the SPA (`WEB_DIST_DIR`) next to `/api`. Required env: `DATABASE_URL`, `APP_BASE_URL`.

```sh
docker build -f docker/Dockerfile -t artifact-hub .
```
