# Artifact Hub — Write-up

Walkthrough: _TODO_ · Details: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)

## What I built and why

A place for a team to publish AI-generated HTML, images, SVG, PDFs and Markdown, browse them, review them and share them, from a web app or from an MCP client. The product choices:

- **Private by default, then three kinds of access:** specific colleagues (view or comment), everyone at the company, or a link that works without signing in (expiring, resettable, view and download only). Each can show the latest version or one pinned version, and removing access takes effect at once. This replaces "expiring URL pasted into Slack" with something the owner can see and undo.
- **Versions, not overwrites:** new content is a new immutable version; edits to title, tags or access are not.
- **Feedback on a version:** comments with one level of replies, resolved by their author, and a filter for this version or all versions.
- **A gallery people can scan:** *Mine / Shared with me / Company* tabs, live previews, keyword search that matches while typing, and type, tag and owner filters.
- **Safe viewing of untrusted content:** HTML and SVG run in a sandbox with no access to the app's cookies.

## What I chose not to build, and why

- **AI metadata suggestions** (title, description and tags from the content, on upload). Designed but not built: time ran short, and of the AI features it had the lowest value, since the owner types these in seconds. Feedback summaries and search save more time, so they came first.
- **OAuth for MCP clients.** Users paste an API token instead. I skipped OAuth because time ran short and because authentication is very likely to change (SSO, for one), so building a flow around today's login would likely be redone. Credentials are one `RequestAuthenticator` each, so OAuth is a new class, not a rewrite.

Also out of scope for the two-day box: SSO and email verification (anyone can sign up with any email, so sharing trusts it; see `docs/ENHANCEMENTS.md`), real S3/Azure drivers (the interface is there), multi-file HTML bundles, teams and groups, notifications, positional annotations, and publishing from a URL (an SSRF risk).

### A sweeper that scales past one volume

An hourly sweeper removes what the app leaves behind: files of failed uploads, drafts never uploaded, expired upload links and idempotency keys. To find unused files it lists the stored files and checks them against the database, 500 at a time.

With the local storage driver, listing reads the whole folder tree into memory before it checks the first file. That is fine at the size this app runs at: each version is one file, so thousands of artifacts mean an array of a few hundred kilobytes and about a second of work, once an hour. It would not be fine with hundreds of thousands of files, where memory and run time grow with the total on every sweep.

I left it that way on purpose: within a two-day time box, the time went to the flows reviewers use, not to a scale the demo will never reach. The way forward is known:

- **Stream the local listing** (Node's `opendir` with `recursive: true`), so memory stays at one batch however many files there are. The `StorageDriver.list` interface is already a stream, so nothing else changes.
- **Move to object storage** (S3 or Azure, already behind the `StorageDriver` interface). Their list APIs are paged by design, and lifecycle rules can expire leftovers without a sweep at all. This is also what horizontal scaling needs, since a local volume pins the app to one replica.

## Architecture overview

A pnpm monorepo in TypeScript: `apps/api` (NestJS), `apps/web` (React, Vite, TanStack Query, Tailwind), `packages/shared` (zod schemas, error codes and DTO types used by the API, the web app and the MCP tools). Data is in PostgreSQL through TypeORM with hand-written migrations; blobs sit behind a `StorageDriver` (local volume now).

- **One set of services behind two doors.** REST controllers and MCP tools are thin adapters over the same services (`ArtifactsService`, `SharingService`, `CommentsService`), each taking an `Actor`. Authorization lives in one `AccessPolicy`, so the web app and MCP can't drift apart. No access answers 404, so existence isn't revealed.
- **Pluggable edges:** storage drivers, AI providers and credential types (session cookie, API token) are each one interface, so a new one is a new class.
- **Upload pipeline:** size limit while streaming, the server decides the type from the content, blob first and then a DB transaction, with idempotency keys and a sweeper for leftovers.
- **Tests:** unit tests, e2e tests against real Postgres through the booted app, and an in-process MCP client calling every tool.

## How the MCP integration works

`POST /mcp` is a stateless Streamable HTTP server inside the same app, authenticated with a per-user API token (created in Settings, which shows a ready-to-paste Claude Desktop config and a `claude mcp add` command). Each request gets a server bound to its user.

The tools follow what users ask for, not table CRUD: `publish_artifact`, `update_artifact`, `find_artifacts`, `get_artifact`, `get_feedback`, `add_comment`, `resolve_comment`, `find_people`, `share_artifact` and `manage_access`.

- **Conversational by design:** "share it with John" → `find_people` returns the matches and tells the agent to confirm one or ask which; "make a link for the client for 7 days" is one `share_artifact` call. Every result is data plus `next_actions`, and errors are tool results with a next step, so the agent can recover.
- **Binary files without base64:** text is sent inline; for images and PDFs the tool returns an upload link for the user and a `curl` command for agents with a shell. It needs the upload token and the owner's credentials.
- **Safe with untrusted text:** titles and comments from others are marked as data, destructive tools take explicit parameters, and repeated publishes and comments are deduplicated.
- **No LLM on the server for MCP:** the calling agent is already one, so it fills the search filters and summarizes threads itself.

## Where and why I used LLM capabilities

Behind one `AiService` (Anthropic implemented, provider pluggable) with a deadline, one retry and a circuit breaker. Nothing waits on it: with AI off or failing, every flow still works and the UI hides the AI parts.

- **Feedback summaries:** the Feedback tab's *Summarize feedback* groups comments into themes, marks open vs resolved and shows disagreements. It is where several reviewers' scattered threads become something an owner can act on. Saved, and marked outdated when comments change.
- **Natural-language search:** an *AI search* button turns "Sara's pricing decks from last week" into the gallery's ordinary filters (visible as chips), falling back to plain search if it fails. The keyword search bar stays instant.
- **Metadata suggestions** (title, description, tags from the content) are not built: see above.
- User content goes into delimited untrusted blocks, with no tools for the model and schema-validated output.

## Deployment approach

One production Docker image: it builds the shared package, the SPA and the API, runs as a non-root user, applies migrations on start, and Nest serves the SPA next to `/api` and `/mcp`. It is hosted on Railway: one app service, Railway Postgres and a Volume for blobs, with the health check on `/api/health`.

## What I'd do next with another week

- Finish the planned items: seed data, thumbnails and open-comment counts on gallery cards, then AI metadata suggestions on upload.
- SSO with verified emails, and sharing with people who don't have an account yet.
- Serve user content from a separate domain, and move storage to S3 or Azure so the app can scale past one replica.
- OAuth for MCP clients, instead of pasting a token, once the auth approach settles.
- Notifications when something is shared or commented on, and several named links per artifact.

## AI tools used

Claude Code did most of the implementation, working step by step from the plan, one reviewed commit per step. Session logs are in `claude-sessions/`. _TODO: note any other tools used._
