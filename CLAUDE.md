# Artifact Hub

pnpm monorepo: `apps/api` (NestJS), `apps/web` (React + Vite), `packages/shared` (zod schemas, error codes, DTO types). The plan and its decisions are in `docs/IMPLEMENTATION_PLAN.md`; known limitations and future work go in `docs/ENHANCEMENTS.md`.

## API conventions (`apps/api`)

### Naming and file layout

- An `@Injectable()` service lives in `<name>.service.ts`, and its class name ends with `Service` (`password-hasher.service.ts` → `PasswordHasherService`). Guards, pipes, filters and modules keep the usual Nest suffixes (`.guard.ts` / `Guard`, `.pipe.ts` / `Pipe`, …).
- Once a module has more than a handful of files, split it into subfolders by concern, not by kind (`auth/sessions/`, `auth/csrf/`, `auth/passwords/`; no `guards/` or `services/` folders). The module root keeps the module, controller, main service, decorators and the types other modules use.
- All types and interfaces in a folder are defined in that folder's types file, `<folder>.types.ts` (e.g. `auth/auth.types.ts`, `auth/sessions/sessions.types.ts`, `config/config.types.ts`). Other files import them from there. Request and response types shared with the web app are an exception: they're inferred from the zod schemas in `packages/shared`.
- Entities are `<name>.entity.ts`.

### Auth and access

- Every route requires authentication (global `AuthGuard`): a session by default. `@Auth('api_token')` (or `@Auth('session', 'api_token')`) names the credentials a route accepts instead; opt out explicitly with `@Public()`. The guard fails closed for non-HTTP transports and for schemes without an authenticator.
- Each kind of credentials is a `RequestAuthenticator` (`auth/auth.types.ts`). Sessions are built into `AuthModule`; others are registered in `app.module.ts` with `AuthModule.register({ imports, authenticators })`, so the auth module never imports them. A new scheme (e.g. OAuth for MCP) is a new authenticator, nothing else.
- Handlers get the caller with `@CurrentActor()` and pass the `Actor` to services. Services decide authorization, never controllers.
- Maintenance methods the sweeper calls (`deleteExpired()`, `deleteAbandonedDrafts()`, …) act for the system and take no `Actor`. Each lives in the service that owns the data, says "Maintenance, for the sweeper" in its doc comment, and is never called from a controller or MCP tool.
- State-changing requests must come from `APP_BASE_URL` (global `CsrfGuard`, Origin/Referer check). e2e tests set `Origin: TEST_ORIGIN`.

### Errors, validation, data

- Throw `AppError(ErrorCode.X, message, details?)` for domain errors. The global filter maps errors to `{ error: { code, message, details?, requestId } }`.
- Validate request bodies with `ZodValidationPipe` and the shared schemas.
- The schema changes only through hand-written migrations, added to the end of the list in `database/migrations/index.ts`. Column names are snake_case.

### Logging

- Use `@InjectPinoLogger(Class.name)`. Log IDs (userId, artifactId), never emails, passwords, tokens or other user input.
- Logging a failure reason (e.g. `wrong_password` / `unknown_email` on a failed login) is fine. Leaving out what the user typed is what keeps it safe.

### Tests

- Unit tests: `src/**/*.spec.ts`. E2E: `test/**/*.e2e-spec.ts`, against real Postgres through `createTestApp()`, which boots the real app.
- e2e data uses unique emails per run and is cleaned up in `afterAll`.
