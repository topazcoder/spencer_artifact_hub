# Artifact Hub — Implementation Plan

A platform for publishing, browsing, reviewing and sharing AI-generated content (HTML, SVG, images, PDFs, Markdown), usable from a web UI and from any MCP client.

Time box: 2 days. The priority is a polished, working core over a large feature count.

---

## 1. Decisions

| Area | Decision |
|---|---|
| Language | TypeScript everywhere |
| Backend | NestJS (REST API + MCP endpoint in the same app) |
| Frontend | React + Vite, React Router, TanStack Query, Tailwind + shadcn/ui |
| Database | PostgreSQL + TypeORM, migrations only (`synchronize: false`) |
| Validation | Zod schemas in a shared package, used by API DTOs, web forms and MCP tool schemas |
| Blob storage | `StorageDriver` abstraction; `local` driver for dev + demo; `s3` / `azure` pluggable via env |
| Auth (web) | Email + password, argon2 hashing, server-side sessions in a DB table, httpOnly cookie |
| Auth (MCP) | Per-user API tokens (Bearer), created in the UI and stored hashed |
| LLM | `AiService` over a pluggable `AiProvider` (`AI_PROVIDER=anthropic` implemented; `openai` stubbed), like `StorageDriver`; models configurable via env |
| Logging | `nestjs-pino`, structured JSON, request IDs carried through every step |
| Packaging | pnpm workspace monorepo; one production image (Nest serves the built SPA) |
| Hosting | Railway: one app service + Railway Postgres + Railway Volume for blobs |

### Product rules
- **Everything requires authentication** except signup, login and opening a valid **share link**, which allows viewing and downloading only. Commenting always requires signing in.
- **Access:** an artifact starts **private** (owner only). In the share dialog the owner can add three kinds of access, in any combination:
  - **People:** colleagues by email, each with `view` or `comment` (`comment` includes `view`). Each email is resolved to an existing user and stored as a **relation** (`shares.user_id → users.id`), never as a plain email. If any email is unknown, the whole request fails with a list of the unknown emails (no verification yet, see ENHANCEMENTS.md). Shared artifacts appear in the recipient's *Shared with me*.
  - **Everyone at the company** (`visibility = 'public'`): every signed-in user can find, view and comment on it (gallery tab *Company*).
  - **Anyone with the link** (step 14): one link per artifact that works **without signing in**, for people outside the company; view and download only. Optional expiry (1 / 7 / 30 days or never), copyable at any time, can be reset (new URL, old one dead) or turned off.
  - Each of the three shows either the **latest version** or **one pinned version**. Removing access takes effect immediately.
- **Versioning:** new content means a new immutable version. Changing metadata (title, description, tags) or access does not create a version.
- **Comments:** attached to a specific version; one level of replies; only top-level comments can be resolved (or reopened), and only by their author.
- **Metadata:** title, description and tags are **required** in MCP tools, because the calling LLM has the best context. In the web UI, the form is pre-filled with AI suggestions after upload, and blanks left on submit are filled asynchronously.
- **Size limit:** `MAX_ARTIFACT_BYTES`, 10 MB by default, enforced while the upload streams in.
- **AI is optional, never blocking:** every flow must work when AI is not configured (`AI_ENABLED=false` or no `ANTHROPIC_API_KEY`), and also when it is configured but fails at runtime. See section 9.1.

---

## 2. Repository layout

```
artifact_hub/
├─ apps/
│  ├─ api/                    # NestJS
│  │  ├─ src/
│  │  │  ├─ main.ts
│  │  │  ├─ app.module.ts
│  │  │  ├─ config/           # typed env config (zod-validated at boot)
│  │  │  ├─ common/           # errors, filters, interceptors, guards, idempotency, request-id
│  │  │  ├─ database/         # data source, migrations, seed
│  │  │  ├─ auth/             # signup/login/logout, sessions, AuthGuard + pluggable authenticators
│  │  │  ├─ users/
│  │  │  ├─ api-tokens/       # create/list/revoke PATs, API token authenticator
│  │  │  ├─ storage/          # StorageDriver interface + local/s3/azure drivers
│  │  │  ├─ artifacts/        # artifacts + versions, content streaming
│  │  │  ├─ uploads/          # upload sessions (MCP binary flow), content validation
│  │  │  ├─ access/           # AccessPolicy: the only place authorization is decided
│  │  │  ├─ sharing/          # access settings: people, company access, link (step 14)
│  │  │  ├─ comments/         # comments, replies, resolve
│  │  │  ├─ search/           # NL query → gallery filters (FTS itself is in artifacts/search/)
│  │  │  ├─ ai/               # AiService + AiProvider (anthropic/), circuit breaker, enrichment jobs
│  │  │  ├─ mcp/              # MCP server (Streamable HTTP) + intent tools
│  │  │  └─ health/
│  │  └─ test/                # e2e (supertest) + MCP client tests
│  └─ web/                    # React SPA
│     └─ src/{routes,components,features,lib/api}
├─ packages/
│  └─ shared/                 # zod schemas, enums, DTO types, error codes
├─ docker/
│  ├─ Dockerfile              # multi-stage production image
│  └─ Dockerfile.dev
├─ docker-compose.yml         # postgres + api (+ optional web) for local dev
├─ docs/
│  ├─ IMPLEMENTATION_PLAN.md
│  └─ ENHANCEMENTS.md
├─ claude-sessions/           # deliverable
├─ WRITEUP.md                 # deliverable
└─ README.md
```

**Module boundary rule:** controllers and MCP tools are thin adapters. Both call the same application services (`ArtifactsService`, `SharingService`, `CommentsService`, …). Every service method takes an `Actor` (`{ userId, via: 'web' | 'mcp' }`) and asks `AccessPolicy` before doing anything. The web API and the MCP server therefore cannot drift apart in behaviour or permissions.

---

## 3. Data model

```
users
  id uuid PK, email citext UNIQUE, password_hash, display_name, created_at

sessions
  id uuid PK, token_hash char(64) UNIQUE, user_id FK, expires_at, last_seen_at,
  ip, user_agent, created_at

api_tokens
  id uuid PK, user_id FK, name, token_prefix (for display), token_hash UNIQUE,
  last_used_at, revoked_at, created_at

artifacts
  id uuid PK, owner_id FK, title, description, tags text[],
  visibility enum('public','private'),       -- public = everyone at the company
  public_pinned_version_id FK NULL,           -- version the company sees; NULL = latest
  current_version_id FK NULL, latest_version_no int default 0,
  status enum('draft','published')           -- draft = awaiting first upload (MCP upload session)
  metadata_source enum('user','ai','mixed'),
  search_vector tsvector (title A, tags B, description C, current version's extracted text D;
                         english config; kept up to date by triggers on artifacts and on
                         artifact_versions.extracted_text, since a generated column can't read
                         another table; GIN indexes on it and on tags),
  created_at, updated_at, deleted_at NULL

artifact_versions                             -- immutable
  id uuid PK, artifact_id FK, version_no int, UNIQUE(artifact_id, version_no),
  storage_key, mime_type, size_bytes, sha256 char(64), original_filename,
  change_note, extracted_text (truncated, for search/AI), created_by FK, created_at

upload_sessions
  id uuid PK, token_hash UNIQUE, user_id FK, artifact_id FK,
  purpose enum('create','new_version'), change_note,
  expires_at, consumed_at NULL, resulting_version_id NULL, created_at

shares                                        -- a colleague's access ("People")
  artifact_id FK, user_id FK, PK(artifact_id, user_id),
  permission enum('view','comment'), pinned_version_id NULL (NULL = latest),
  created_by FK, created_at, updated_at       -- removing someone deletes the row (and is logged)

share_links                                   -- step 14: anyone with the link, no sign-in
  id uuid PK, artifact_id FK, token_hash UNIQUE (lookup), token_ciphertext (AES-256-GCM, so the
  owner can copy the link again), pinned_version_id NULL, expires_at NULL, revoked_at NULL,
  created_by FK, created_at                   -- at most one live link per artifact; reset = revoke + new row

comments
  id uuid PK, artifact_id FK, version_id FK, parent_id FK NULL (replies only one level deep),
  author_id FK, body text (≤ 5000), anchor jsonb NULL (reserved: region/page),
  resolved_at NULL, resolved_by NULL, edited_at NULL, deleted_at NULL, created_at

feedback_summaries                            -- one per artifact and set of versions; replaced on regenerate
  id uuid PK, artifact_id FK, version_ids uuid[] (sorted; empty = every version), UNIQUE(artifact_id, version_ids),
  summary jsonb, input_hash char(64) (SHA-256 of the comments as summarized: a different hash = outdated),
  comment_count, partial, model, generated_at

ai_jobs
  id uuid PK, kind enum('enrich_metadata','extract_text'), artifact_version_id FK,
  status enum('pending','running','done','failed'), attempts, last_error, created_at, updated_at

idempotency_keys
  user_id FK, key uuid, route, request_hash char(64) NULL, resource_id uuid NULL (NULL = in progress),
  created_at, PK(user_id, key)                -- TTL 24h, pruned on schedule; no response copy:
                                              -- a replay answers with resource_id as it is now
```

No separate activity/audit table: version history (`artifact_versions`), comments (`comments`) and share lifecycle (`shares.created_at / revoked_at`) already record who did what and when. Security-relevant events go to structured logs (section 11).

---

## 4. Access control (`AccessPolicy`)

One pure-ish service that both REST and MCP use for every decision. Unit-tested exhaustively.

```
can(actor, action, artifact, ctx?) where action ∈ view | comment | edit | share | delete
```

| Who | view | comment | edit / new version / share / delete |
|---|---|---|---|
| Owner | ✓ | ✓ | ✓ |
| Any signed-in user, artifact shared with everyone at the company (`public`; drafts stay owner-only) | ✓ | ✓ | ✗ (**403**: they can see it) |
| A person it is shared with | ✓ | if permission=comment | ✗ |
| Anyone with a valid link, signed in or not (step 14; only through the `/api/s/:token` endpoints) | ✓ (and download) | ✗ | ✗ |
| Everyone else | ✗ (respond **404**, not 403, so existence isn't revealed) | ✗ | ✗ |

Access is the most generous of what applies. It is read on every request, so removing someone, turning company access off or revoking a link takes effect immediately, including in *Shared with me*. A link is **valid** if it is not revoked, `expires_at` is null or in the future, and the artifact is published and not deleted.

Comment rules: everyone who can view an artifact reads the comments on the versions they can see; posting and replying need `comment`. A reply's parent must be top-level and on the same version. Resolve/reopen is allowed only for the author of a top-level comment. Edit/delete is allowed only for the author; editing and resolving also need `comment` (an author downgraded to view can still delete their own comments). Delete is soft: the row is kept, but a deleted comment is hidden, and a deleted top-level comment hides its replies with it.

**Versions:** company access, each person and the link show either the latest version or one pinned version. A user sees every version if any access that applies to them is unpinned; otherwise only the pinned versions, the newest of them as current. The owner always sees everything.

---

## 5. Storage abstraction

```ts
interface StorageDriver {
  put(key: string, body: Readable, opts: { contentType: string; size?: number }): Promise<{ size: number; sha256: string }>;
  getStream(key: string, range?: { start: number; end: number }): Promise<Readable>;
  stat(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}
```

- The driver is selected by `STORAGE_DRIVER=local|s3|azure` through a Nest factory provider. The `local` driver is implemented now; `s3` and `azure` are stubs with the interface wired, to be implemented later.
- **Keys are generated by the server only:** `artifacts/{artifactId}/{versionNo}-{uuid}`. User filenames never reach the filesystem. The local driver also checks that every resolved path stays under `STORAGE_LOCAL_ROOT`.
- **Writes are atomic:** stream to a `*.tmp` file → fsync → rename. The SHA-256 is computed while streaming. Blobs are immutable: `put` refuses an existing key.
- Content is always **streamed through the API** after an access check, never served by URL from storage, so access rules are identical across drivers.

---

## 6. Upload and publish pipeline

The web UI and MCP use the same pipeline:

1. **Receive:** multipart with busboy/multer `limits.fileSize = MAX_ARTIFACT_BYTES`, or MCP inline text `content` (byte length checked before processing), or the raw-body `PUT` to an upload session (streamed with the same limit). Anything over the limit gets `413 ARTIFACT_TOO_LARGE`.
2. **Validate type:** the allowlist is `text/html`, `image/svg+xml`, `text/markdown`, `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf`. The **server** decides the MIME type from the first 64 KB of content; the client's `Content-Type` is ignored.
   - **Binary formats** come from magic bytes (`file-type`) only. The filename is ignored, and any other detected binary type (zip, executables, …) is rejected.
   - **Text formats** must be UTF-8 throughout, with no NUL bytes (checked as the content streams). Bytes alone can't tell them apart (any text is valid Markdown, and Markdown may contain HTML), so the **extension picks and the content must match**: `.md`/`.markdown` → Markdown (any text); `.html`/`.htm` → HTML (must start with markup); `.svg` → SVG (must have an `<svg>` root; DOCTYPEs with an internal subset are rejected). MCP passes the format explicitly instead of a filename.
   - **No or another extension:** only an unmistakable SVG (`<svg>` root) or HTML document (`<!doctype html>` / `<html>`) is accepted; Markdown always needs `.md` or an explicit format, so `.txt`, `.csv`, `.js` etc. are rejected.
3. **Store blob** under a fresh key, with the hash computed while streaming.
4. **Idempotency check** (section 10): if this owner already published the same `sha256` (or the target's current version has it), return the existing result.
5. **DB transaction:** `SELECT … FOR UPDATE` the artifact → insert the version with `latest_version_no + 1` → update `current_version_id`. Commit.
6. **On failure after step 3:** delete the blob as a best effort; the sweeper catches anything left over (section 10).
7. **After commit:** enqueue the `extract_text` and `enrich_metadata` jobs (asynchronous; never blocks or fails the publish).

**Web UI flow:** drop a file → `POST /api/uploads/preview` returns the detected type and AI-suggested title/description/tags (synchronous, with a timeout of about 8 s; on timeout the form stays empty) → the user edits and publishes. Fields left blank at publish time are filled later by the enrichment job, marked `metadata_source='ai'` and shown with a subtle "suggested" badge the owner can edit.

---

## 7. Viewing user content safely

- The content endpoint is `GET /api/artifacts/:id/versions/:no/content`. It is authenticated with the session cookie and passes through `AccessPolicy`. Share links serve the version they show at `GET /api/s/:token/content`, without a session, after `AccessPolicy.linkDenialReason`, with the same headers plus `X-Robots-Tag: noindex`.
- Response headers on every content response:
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: sandbox allow-scripts allow-popups; default-src 'none'; …`. Without `allow-same-origin`, the document gets an opaque origin, so its scripts cannot read app cookies or call the API, even when the content URL is opened directly. Scripts, styles, fonts, images and media may load from external `https:` URLs (CDNs), so AI-generated HTML renders as intended; `connect-src`, `form-action`, `frame-src` and `base-uri` are `'none'`, and `frame-ancestors 'self'` lets only the app frame it. (Trade-off: viewing such a page can reach third-party hosts.)
  - `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`
  - `Cache-Control: private, no-cache` with the content hash as `ETag`: revalidation is a 304, but always after the access check, so revoked access takes effect immediately.
- The SPA renders HTML in an `<iframe sandbox="allow-scripts allow-popups">`; images **and SVG** use `<img>` (an SVG's scripts never run there); Markdown is rendered with `react-markdown` (raw HTML shown as text, no `rehype-raw`; `javascript:` URLs dropped). **PDFs are rendered with pdf.js** to canvases: browsers refuse to show PDFs in their built-in viewer under a CSP sandbox. The Markdown and PDF viewers are lazy-loaded.
- "Full screen" uses the Fullscreen API on the in-app viewer, rather than opening the raw content URL (where a sandboxed PDF wouldn't render).
- The CSRF guard rejects state-changing requests with `Origin: null` or a foreign `Origin`.
- `Download` sets `Content-Disposition: attachment` with a sanitized filename.
- Later hardening (ENHANCEMENTS.md): serve user content from a separate domain (`usercontent.*`).

---

## 8. MCP server

- Uses `@modelcontextprotocol/sdk`, **Streamable HTTP** transport in stateless mode, mounted in Nest at `POST /mcp`.
- **Auth:** `Authorization: Bearer <api token>` → `Actor{via:'mcp'}`. Tokens are created on the **Settings → API tokens** page, which also shows a copy-paste Claude Desktop config (the header goes through an env variable because some clients split arguments on spaces) and a `claude mcp add` command for Claude Code:

```json
{
  "mcpServers": {
    "artifact-hub": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<app>.up.railway.app/mcp",
               "--header", "Authorization:${ARTIFACT_HUB_AUTH}"],
      "env": { "ARTIFACT_HUB_AUTH": "Bearer ah_..." }
    }
  }
}
```

### Intent-based tools
Tool descriptions are written the way users ask for things, and each says when to use the tool. Every result is facts as data, for the agent to word for the user: `structuredContent`, and the same JSON as text for clients that show the model only text. It always includes the artifact's web URL and suggested next actions (`next_actions`).

| Tool | User intent it serves | Key inputs | Notes |
|---|---|---|---|
| `publish_artifact` | "Publish this mockup / share this report with the team" | `title`, `description`, `tags` (all required), `format` + `content?` (text formats only: HTML/SVG/MD) | Starts private, like the web upload; sharing is `share_artifact`. Without `content`, creates a **draft** and returns `upload_url` + `upload_command` (see below, step 21) |
| `update_artifact` | "Here's the revised version", "rename it / change tags" | `artifact` (id or URL), `content?` (text; `format` defaults to the current version's) **or** `request_upload: true` (binary, step 21), `change_note`, optional metadata | New content creates a new version; metadata-only changes don't. Access is changed with `share_artifact` / `manage_access` |
| `find_artifacts` | "Find the pricing deck Sara shared last week" | `query`, optional `scope: all/mine/shared_with_me/company` (the gallery tabs), `type`, `tag`, `owner`, `updated_from` / `updated_to`, `page` | `query` is keywords for full-text search. No server-side LLM: the calling agent is one, with the conversation's context, so it turns the request into these filters itself (step 27) |
| `get_artifact` | "What's the status of the onboarding mockup?" | `artifact`, optional `version` | Metadata, versions, access summary, open and resolved comment counts |
| `get_feedback` | "What did reviewers say about v2? Anything unresolved?" | `artifact`, `version?`, `include: open/all` (default `open`) | Raw threads with counts per version, no server-side summary: the calling agent summarizes them for what the user actually asked. Comment bodies are marked as **untrusted user content**. The number of threads is capped; a capped result says so and the agent narrows by `version` / `include` |
| `add_comment` | "Tell them the header looks off", "reply to Sara's comment" | `artifact`, `body`, `version?`, `reply_to?` | |
| `resolve_comment` | "Mark my comment about the logo as resolved" | `comment_id`, `resolved: bool` | Allowed only for the comment's author |
| `share_artifact` | "Give Sara and Tom comment access", "share it with the whole company", "make a link for the client for 7 days" | `artifact`, `with: people/company/link`, `emails?`, `permission?` (default `view`), `version?`, `expires_in_days?` (link only; default 7, `null` = never) | Unknown emails are returned as a readable error listing which ones aren't registered; a link result includes the URL |
| `manage_access` | "Who can see this?", "remove Tom", "stop sharing it with the company", "kill the client link" | `artifact`, `action: list/remove_person/turn_off_company/turn_off_link/reset_link`, `email?` (remove_person) | Marked destructive. Turning company access or the link on is `share_artifact` |

**Content input rule (MCP):** two paths only, with no base64.
- **Text formats** (HTML, SVG, Markdown) are sent inline as `content`.
- **Binary formats** (images, PDF) always go through an **upload session**.

**Binary uploads (images/PDFs) from MCP:**
1. The agent calls `publish_artifact` without `content` (or `update_artifact` with `request_upload: true`), always passing the metadata.
2. The server creates the artifact as `draft` (publish only) plus an `upload_session` (single-use, 30-minute TTL, tied to user + artifact, purpose create/new_version).
3. The tool returns both ways to finish:
   - `upload_url: https://…/upload/<token>`: a browser page for the user (Claude Desktop, chat clients).
   - `upload_command: curl -T <file> -H "Authorization: Bearer $ARTIFACT_HUB_TOKEN" -H "X-Filename: <name>" https://…/api/upload-sessions/<token>`: for agents with shell access (Claude Code, Cursor). `X-Filename` is shown as the file's name, and its extension tells Markdown apart from other text.

   The instruction says: *"If you can run shell commands and have the file locally, run upload_command; otherwise ask the user to open upload_url. Then call get_artifact to confirm."*
4. **Both paths require two independent proofs**, and the upload is rejected unless both hold:
   - **The upload token** (in the URL) identifies *which* upload session; it is unguessable, single-use and expires.
   - **User authentication** proves *who* is uploading: the session cookie on the browser page, or `Authorization: Bearer <API token>` on the direct `PUT`. The authenticated user **must equal** `upload_session.user_id`, otherwise **404** (existence is not revealed).

   A leaked upload URL alone is therefore useless, and so is a valid API token without the matching session.
5. Then:
   - The token is consumed atomically (`UPDATE … SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL AND expires_at > now()`).
   - The body is streamed through the normal pipeline (size limit, type sniffing, hashing). The `PUT` takes the raw body, with an optional `X-Filename` header (sanitized and used only for display).
   - If the pipeline fails (wrong type, too large), the session is **released** (`consumed_at` reset), so the user can retry with the correct file before expiry.
   - A replay after success returns the original result (idempotent).
6. Drafts never uploaded stay invisible to others and are cleaned up after 24 h.

**Publishing from a URL is deliberately not supported** (it would open an SSRF risk).

**MCP errors** come back as tool results with `isError: true` and an actionable message (e.g. *"Artifact not found or you don't have access. Use find_artifacts to search."*) instead of transport errors, so the agent can recover.

---

## 9. AI features

All behind `AiService`, configurable with `AI_ENABLED`, `ANTHROPIC_API_KEY`, `AI_MODEL_FAST` (default `claude-haiku-4-5-20251001`) and `AI_MODEL_SMART` (default `claude-sonnet-5-5`). With AI disabled or failing, the product still works fully.

| Feature | Where it shows up | How |
|---|---|---|
| **Metadata suggestions** | Web upload form pre-fill; async fill of blanks | Fast model. HTML/MD/SVG → extracted text; images → vision input; PDF → document input. Structured output validated by zod (title ≤ 120, description ≤ 500, ≤ 8 tags, normalized lowercase). Reuses existing tags when relevant |
| **Feedback summary** | A dialog from the Feedback tab's *Summarize feedback* button, for the version filter's choice (`GET` / `POST /api/artifacts/:id/feedback-summary`); not in MCP, which returns raw threads for the calling agent to summarize for the user's question, so comments don't pass through two LLMs | Smart model, on request only. Groups comments into themes, marks resolved vs. open, highlights disagreements; per version or across versions (for viewers limited to pinned versions, across those only). Saved in `feedback_summaries` and returned until the comments change (hash of the input), then marked outdated until someone asks again |
| **Natural-language search** | Gallery: an *AI search* button next to the search bar opens a dialog to describe what you're looking for (the search bar keeps its instant keyword search). Not `find_artifacts`: the agent fills its filters itself | Fast model turns the query into `{ keywords, scope, type, tag, owner, date range }` (`GET /api/search/interpret`), which the gallery applies as ordinary filters (owner and dates as removable chips). Falls back to plain full-text search on the raw text if the LLM fails. No extra embeddings provider needed |

### 9.1 Graceful degradation (AI not configured or failing)

**Principle:** AI only adds to the experience; it is never needed to complete a task. No user action waits on, or fails because of, an LLM call.

**Mechanics:**
- Providers implement one call (structured output for a system prompt, a prompt and a zod schema); `AiService` owns everything else, the same for every provider: deadline, retry, circuit breaker, validation, logging. With `AI_ENABLED=false` or no API key there is no provider, `AiService.enabled` is false, and a warning is logged once at boot.
- `GET /api/config` exposes `features.ai: boolean` so the SPA hides AI elements instead of showing broken ones.
- Each runtime call has a timeout, makes 1 retry for retryable errors (429/5xx/timeout), and has a circuit breaker: after N consecutive failures, AI calls are skipped for a cool-down period (`AI_UNAVAILABLE` is logged, not shown to the user).
- AI errors never reach the global exception filter as 5xx errors; each feature catches them and falls back.

| Feature | AI not configured | AI configured but fails / times out |
|---|---|---|
| Upload form pre-fill | Form shows empty fields; **title becomes required** in the web UI (default: filename without extension); description/tags optional | Suggestions request times out after about 8 s → form stays editable throughout (never disabled while waiting); a subtle "Couldn't suggest details" hint; user can publish immediately |
| Async fill of blank metadata | Job not enqueued; fields stay empty | Job retries up to 3 times with backoff, then marked `failed`; artifact stays published and fully usable |
| Feedback summary | Panel hidden; raw comment threads shown as usual | Last cached summary is shown with an "outdated" badge, or the panel is hidden with "Summary unavailable"; threads always shown |
| Natural-language search | Search bar does plain full-text search + filter controls | Falls back to plain full-text search on the raw query (logged); results are never empty because of AI failure |
| MCP `find_artifacts` | Not affected: no server-side AI | Not affected: no server-side AI |

**Tests:** the e2e suite runs the core flows with `NoopAiService`, and there's a test with a failing AI stub (it throws or hangs) to verify that publish, search and feedback still succeed.

**LLM hygiene:** user content is placed inside clearly delimited `<untrusted_content>` blocks with an instruction to treat it as data; no tools are given to these LLM calls; outputs must pass schema validation or are discarded; input text is truncated to a size budget; per-user rate limits apply to AI endpoints; token usage is logged.

---

## 10. Error handling and idempotency

### Errors
- Domain errors are defined in `packages/shared` with stable codes: `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_FAILED`, `ARTIFACT_TOO_LARGE`, `UNSUPPORTED_TYPE`, `UPLOAD_SESSION_EXPIRED`, `UPLOAD_SESSION_USED`, `SHARE_RECIPIENT_UNKNOWN` (422, lists the unknown emails), `SHARE_EXPIRED` / `SHARE_REVOKED` (410, so the link page can explain), `RATE_LIMITED`, `CONFLICT`, `AI_UNAVAILABLE`, ….
- A global exception filter maps them to HTTP status + `{ error: { code, message, details?, requestId } }`. The MCP adapter maps them to `isError` tool results.
- Unknown errors are logged with stack and request ID; the client sees a generic message plus the `requestId`.
- The web UI uses typed API client errors with toasts / inline form errors and retry on network failures for idempotent calls.

### Idempotency (critical write paths)
| Operation | Mechanism |
|---|---|
| Web publish / new version / comment | `Idempotency-Key` header (UUID generated per form submission, kept across retries). Stored with the request hash and what the request created; a replay returns that resource as it is now; same key with a different body or route, or while the first request is running → `409`. Sharing with people needs none: it updates the person's row |
| MCP publish | Dedupe on `(owner, sha256)` within 10 min → return the existing artifact with `"deduplicated": true` |
| MCP update with content | If `sha256` equals the current version's → no new version; return current with `"unchanged": true` |
| MCP add_comment | Dedupe identical `(author, version, parent, body)` within 2 min |
| MCP share_artifact | Naturally idempotent: sharing with someone who has access updates their settings (one row per person), the company switch is a setting, and turning on a link that is already on keeps its URL |
| Upload session | Single-use token consumed atomically |
| Version numbering | The blob key takes `latest_version_no + 1`; the transaction locks the artifact row and answers `409 CONFLICT` (blob deleted, client retries) if another version was committed meanwhile. `UNIQUE(artifact_id, version_no)` backs it up |

### Consistency
- Order of operations: blob first, then DB transaction. On DB failure the blob is deleted on a best-effort basis.
- An hourly sweeper deletes blobs with no version row (older than 1 h) and temporary files of writes cut short, drafts never uploaded (after 24 h, unless an upload link is still open), upload sessions a day after they expired (so the upload page can still say "expired") and idempotency keys older than 24 h. Each module that owns the data decides what is a leftover; the sweeper only runs their cleanups.
- AI jobs are rows in `ai_jobs`, processed by an in-process worker (with retry and backoff, max 3 attempts); pending jobs are resumed on boot. No external queue is needed for this scale.

---

## 11. Logging and observability

- `nestjs-pino`, JSON in prod, pretty output in dev; `LOG_LEVEL` env.
- A request ID (incoming `X-Request-Id` or generated) is stored in AsyncLocalStorage, added to every log line and returned in the response header and error body. MCP tool calls get their own ID plus the tool name.
- **Step logs in the main services:**
  - publish: received → type detected → blob stored (bytes, ms) → dedupe decision → version committed → jobs enqueued
  - sharing: people added / changed / removed, company access changed (user ids only, never emails); step 14: link turned on / changed / reset / turned off, link opened or refused (reason)
  - access: denials at `debug`, with reason
  - comments: created / resolved
  - AI: job start, model, tokens in/out, latency, outcome
  - upload sessions: issued / consumed / expired
- **Redaction:** `authorization`, `cookie`, `set-cookie`, `password`, `token`, and request bodies on upload/content routes.
- Security-relevant events (share created/revoked/denied, token created/revoked, login failures) are logged at `info`/`warn` with actor and target IDs; this serves as the audit trail for now.
- `GET /api/health` (DB + storage writable) is used by the Railway healthcheck.

---

## 12. Security risks and mitigations

| # | Risk | Mitigation |
|---|---|---|
| S1 | **Stored XSS via uploaded HTML/SVG** stealing sessions or acting as the user | CSP `sandbox` (no `allow-same-origin`) on content responses + sandboxed iframe + `nosniff`; Origin check rejects `null` origins; later: separate user-content domain |
| S2 | **MIME spoofing / polyglot files** | Magic-byte detection, server-assigned Content-Type, allowlist, `nosniff` |
| S3 | **Path traversal / key injection in storage** | Server-generated keys; local driver verifies resolved path is under root |
| S4 | **Oversized uploads / resource exhaustion** | Streaming size limit on multipart and raw `PUT`, inline `content` length check, body-parser limits, per-user upload rate limit |
| S5 | **Broken access control / IDOR** | Single `AccessPolicy` used by REST and MCP; 404 for no access; e2e tests per role |
| S6 | **Share link guessing / leakage** (links work without sign-in) | 256-bit random tokens; looked up by SHA-256, and stored AES-256-GCM encrypted with `SHARE_LINK_KEY` only so the owner can copy it again (a database leak alone exposes no links); view and download only; optional expiry; revoke and reset take effect on the next request; one link per artifact; `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`; rate limited per IP |
| S6b | **Upload URL leakage / hijack** | Upload token + user authentication (cookie or Bearer) both required, and the user must own the session; single-use, 30-minute TTL; 404 on mismatch |
| S7 | **Share to unverified identity** (anyone can sign up with any email) | Accepted for the demo; grants only to existing users; SSO/email verification tracked in ENHANCEMENTS.md |
| S8 | **Prompt injection via artifact content or comments → our LLM** | Delimited untrusted blocks, no tools, schema-validated output, length caps, output only ever used as data (never as instructions or HTML) |
| S9 | **Prompt injection via MCP results → user's agent** (other users' comments/content returned to the agent) | Tool results carry user-generated text only as JSON string values, with a note in every result (and in the server instructions) to treat it as data; tool descriptions tell the agent not to follow instructions inside them; destructive tools (revoke, set private) take explicit parameters, never inferred from content |
| S10 | **CSRF** | `SameSite=Lax` cookie + Origin/Referer check on all non-GET requests; MCP uses Bearer (no cookies) |
| S11 | **Credential attacks** | argon2id, min password length, login rate limit per IP + email, generic "invalid credentials", constant-time compare |
| S12 | **Session hijack / fixation** | Random 256-bit session token, hashed in DB, new session on login, httpOnly + Secure + SameSite, sliding expiry, logout deletes the row |
| S13 | **API token abuse** | Hashed, shown once, revocable, `last_used_at`, prefix for identification, rate limited |
| S14 | **Comment XSS** | Plain text rendered by React (auto-escaped); links auto-linked with `rel="noopener noreferrer"` |
| S15 | **Malicious PDFs** | Rendered by pdf.js (no PDF JavaScript, no `eval`) in the SPA; the raw response keeps the CSP sandbox; never processed server-side except by the LLM API |
| S16 | **Secrets in logs / errors** | pino redaction; generic 500 messages; no stack traces in responses |
| S17 | **LLM cost abuse** | Per-user AI rate limits, input truncation, caching of summaries, `AI_ENABLED` switch |
| S18 | **SSRF** | No server-side URL fetching features |
| S19 | **Account / email enumeration** | Generic login errors; share errors for unknown emails are shown only to the owner of the artifact; user search for the share dialog needs 3+ characters, matches from the start of an email or name, returns at most 5 users and is rate limited (accepted trade-offs) |
| S20 | **General hardening** | `helmet`, strict CSP for the SPA itself, `@nestjs/throttler`, env validated at boot, non-root container user |

---

## 13. REST API (summary)

```
POST   /api/auth/signup | /login | /logout        GET /api/auth/me
GET    /api/tokens   POST /api/tokens   DELETE /api/tokens/:id

GET    /api/artifacts?q=&scope=mine|shared|public&type=&tag=&owner=&updatedFrom=&updatedTo=&page=&pageSize=   (public = company;
       type = html|image|pdf|markdown|svg; q = words, each matching a word or its start, ranked)
GET    /api/artifacts/tags?scope=                 (tags in a scope, most used first: gallery tag filter)
POST   /api/uploads/preview                       (multipart → detected type + AI suggestions)
POST   /api/artifacts                             (multipart: `metadata` JSON field, then `file`) [Idempotency-Key]
GET    /api/artifacts/:id
PATCH  /api/artifacts/:id                         (title, description, tags)
DELETE /api/artifacts/:id                         (soft delete)
POST   /api/artifacts/:id/versions                (multipart: `metadata` JSON {changeNote}, then `file`) [Idempotency-Key]
GET    /api/artifacts/:id/versions
GET    /api/artifacts/:id/versions/:no/content    (sandboxed stream; ?download=1)

GET    /api/artifacts/:id/comments?version=&include=open|all   (threads oldest first; no version =
       every version the caller can see; include defaults to all)
POST   /api/artifacts/:id/comments                (body, versionNo?, parentId?)          [Idempotency-Key]
PATCH  /api/comments/:id                          (edit body | resolved)
DELETE /api/comments/:id
GET    /api/artifacts/:id/feedback-summary?version=   (the saved summary and whether it's outdated)
POST   /api/artifacts/:id/feedback-summary?version=   (summarize now, unless it's up to date; 503 AI_UNAVAILABLE)
GET    /api/search/interpret?q=&scope=            (natural-language search → gallery filters)

GET    /api/artifacts/:id/access                  (owner: company access, people, link)
PUT    /api/artifacts/:id/access/company          ({ enabled, versionNo })
POST   /api/artifacts/:id/access/people           ({ emails, permission, versionNo }; 422 lists unknown emails)
PATCH  /api/artifacts/:id/access/people/:userId   ({ permission?, versionNo? })
DELETE /api/artifacts/:id/access/people/:userId
GET    /api/users/search?q=                       (share dialog autocomplete)
PUT    /api/artifacts/:id/access/link             (step 14: turn on or change { expiresAt, versionNo })
DELETE /api/artifacts/:id/access/link             POST /api/artifacts/:id/access/link/reset
GET    /api/s/:token                              (public: title, owner name, the version shown)
GET    /api/s/:token/content                      (public: sandboxed stream; ?download=1)

GET    /api/upload-sessions/:token                (session cookie; owner only → draft info for the upload page)
POST   /api/upload-sessions/:token                (multipart from upload page; session cookie; owner only)
PUT    /api/upload-sessions/:token                (raw body; Bearer API token; owner only; for agents with shell access)
GET    /api/config                                (public: maxArtifactBytes, features.ai)
GET    /api/health
POST   /mcp
```

---

## 14. Web UI

| Screen | Purpose |
|---|---|
| Login / Signup | Simple, one demo account hint on the login page |
| **Gallery** (home) | Tabs: *Mine* (default) · *Shared with me* · *Company*, as `?scope=mine|shared|public`. Card grid with live thumbnails (image / first PDF page via `<img>`/iframe preview, HTML in a scaled sandboxed iframe), type badge, tags, owner, open-comment count, updated time. NL search bar + tag/type filters |
| **Artifact page** | Large viewer on the left; right panel tabs: *Feedback* (AI summary at top, threads with replies, resolve, version filter "this version / all versions"), *Versions* (list, switch, change notes), *Details* (metadata, edit if owner). Header actions: Share, Upload new version, Download, Open full screen |
| **Share dialog** | A one-line summary of who can see it, widest audience first ("Anyone with the link…", "Everyone at the company…", "You and 2 people…", "Only you can see it"), then one tab per kind of access, each opening with a sentence on who it reaches. **People** (count badge): add by email with autocomplete of existing users, *Can view* / *Can comment*, version; list with change and remove. **Company** (*On* badge): switch + version. **Link** (step 14): switch, expiry (1 / 7 / 30 days, never), version, Copy and Reset link. Versions read *All versions* (follows the latest, history included) or *Only vN*. Changes save as they are made. Footer: *Copy link* (the artifact's own URL, for signed-in colleagues) on the People and Company tabs; the Link tab copies its own link |
| **Publish dialog** | Drag-and-drop → AI pre-fill → edit → publish. Artifacts start private; access is set in the share dialog |
| **Upload page** (`/upload/:token`) | Landing page for the MCP binary flow: shows the artifact name the agent created, a drop zone, and a success state ("You can return to your conversation") |
| **Settings** | API tokens + ready-to-copy Claude Desktop config |
| Share link (`/s/:token`) | Step 14. Public page outside the app shell: title, owner, viewer, Download; *Open in Artifact Hub* for signed-in users who have access; clear "expired / turned off" state |

---

## 15. Local development and deployment

### Local dev
- `docker-compose.yml`: `postgres:16`, `api` (Dockerfile.dev, `nest start --watch`, source mounted, blob dir mounted at `./.data/blobs`), optional `web` (Vite dev server).
- Vite proxies `/api` and `/mcp` to the API → same-origin like production.
- `pnpm dev` runs everything; `pnpm db:migrate`, `pnpm db:seed`.

### Production (Railway)
- Multi-stage `Dockerfile`: install → build `shared` → build `web` → build `api` → slim runtime (`node:22-alpine`, non-root, prod deps only). Nest serves `web/dist` via `ServeStaticModule` with SPA fallback (excluding `/api` and `/mcp`).
- On start: run migrations → start the server.
- Railway: app service + Postgres plugin + **Volume mounted at `/data`** (`STORAGE_LOCAL_ROOT=/data/blobs`); single replica.
- Healthcheck `/api/health`.
- **Seed:** demo accounts (`demo@…`, `reviewer@…`) with a few sample artifacts, comments and shares, so reviewers can try every flow right away.

### Environment variables
```
NODE_ENV, PORT, APP_BASE_URL, LOG_LEVEL, TRUST_PROXY_HOPS (1 on Railway)
DATABASE_URL
SESSION_TTL_DAYS=7, COOKIE_SECURE=true
STORAGE_DRIVER=local, STORAGE_LOCAL_ROOT=/data/blobs
  (s3: S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)
  (azure: AZURE_STORAGE_CONNECTION_STRING, AZURE_CONTAINER)
SHARE_LINK_KEY                     (32 bytes, base64: `openssl rand -base64 32`; encrypts share link tokens; required in production, a fixed dev-only key otherwise)
MAX_ARTIFACT_BYTES=10485760
UPLOAD_SESSION_TTL_MINUTES=30
SWEEP_INTERVAL_MINUTES=60            (0 turns the sweeper off; the e2e tests do, as suites share a database)
AI_ENABLED=true, AI_PROVIDER=anthropic, ANTHROPIC_API_KEY, AI_MODEL_FAST, AI_MODEL_SMART  (all optional; app runs without them)
AI_TIMEOUT_MS=8000, AI_SMART_TIMEOUT_MS=60000, AI_CIRCUIT_FAILURE_THRESHOLD=5, AI_CIRCUIT_COOLDOWN_SECONDS=60
RATE_LIMIT_AI_PER_MINUTE=20            (per user, routes that call AI)
RATE_LIMIT_LOGIN_PER_IP=20, RATE_LIMIT_LOGIN_PER_EMAIL=10, RATE_LIMIT_LOGIN_WINDOW_SECONDS=900
RATE_LIMIT_USER_SEARCH_PER_MINUTE=60   (per user, share dialog autocomplete)
RATE_LIMIT_SHARE_LINK_PER_MINUTE=120   (per client IP, share link page and content)
RATE_LIMIT_API_TOKEN_PER_MINUTE=120    (per user, requests authenticated with an API token)
RATE_LIMIT_* (upload: added with that feature)
SEED_DEMO=true
```

---

## 16. Testing strategy

- **Unit:**
  - `AccessPolicy` (full matrix of roles × visibility × status × deleted × action × transport, plus version pinning across company access and people)
  - content-type detection
  - local storage driver (traversal, atomic writes)
  - idempotency service
  - NL-search parser fallback
  - AI output validation
- **E2E (supertest + real Postgres via compose):**
  - signup/login/session
  - publish → version → comment/reply/resolve
  - sharing: people (unknown emails, upsert, change, remove), company access, pinned versions across access levels, *Shared with me*, user search and its rate limit; step 14: links without sign-in (expiry, reset, turn off)
  - upload sessions: single-use, expiry, release on failed validation, browser + `PUT` paths; rejected without auth, with another user's cookie/token, or with a valid token but a different session
  - size limit
  - 404-on-no-access
- **MCP:** in-process MCP SDK client calling each tool against the test app.
- **CI-lite:** `pnpm typecheck && pnpm lint && pnpm test` (GitHub Actions if time permits).
- **Smoke test** against the deployed URL after each deploy.

---

## 17. Implementation order (2 days)

The work is built in thin **vertical slices**: each step goes from the database through the API to the UI, ships with its own tests, and is **one commit** that can be reviewed and tried on its own. Work stops after each step for review. The commit history is evaluated.

Two changes from a feature-by-feature order: idempotency and the sweeper come after the core flows (nothing earlier depends on them), and `AccessPolicy` starts as owner-only in step 8 and is extended in step 12.

**Foundation** ✅ done (Railway deploy deferred to the end)
1. ✅ Monorepo scaffold: pnpm workspace, shared package, empty Nest and Vite apps, lint and tsconfig.
2. ✅ Config validated with zod at boot, pino logging with request IDs, error filter and error codes, health endpoint.
3. ✅ Docker, compose, Postgres with TypeORM and the first migration, then **deploy to Railway** (deploy deferred).

**Auth** ✅ done
4. ✅ Signup, login, logout and `me` endpoints, sessions, guard, CSRF Origin check, plus e2e tests.
5. ✅ Login and signup screens, app shell and protected routes.

**Artifacts**
6. ✅ `StorageDriver` with the local driver, plus unit tests.
7. ✅ Content validation (type sniffing, allowlist, streaming size limit), plus unit tests.
8. ✅ Create an artifact with v1, get one, list mine. `AccessPolicy` starts as owner-only.
9. ✅ Content endpoint with sandbox headers, and a viewer for each type.
10. ✅ Publish dialog and the gallery's *Mine* tab, without AI. (`GET /api/config` added early for the size limit; the visibility control waits for step 12, so everything is published private until then.)
11. ✅ New versions, metadata edits, soft delete, and the Versions and Details tabs.

**Access and sharing**
12. ✅ Public visibility and the *All public* tab, plus the full `AccessPolicy` test matrix. (Step 13 renames the tab *Company* and moves the visibility choice into the share dialog.)
13. ✅ Sharing inside the company: people (view/comment) and *Everyone at the company*, each with a pinned or latest version; the share dialog; *Shared with me*. (Replaces a first version with signed-in link shares, dropped for this simpler model.)
14. ✅ *Anyone with the link* without sign-in: one link per artifact, expiry, reset, encrypted token, and the public `/s/:token` viewer with download.
15. ✅ Plain full-text search and filters in the gallery. (Search uses prefix matching so results show while typing: every word must match a word or its start, ranked by `ts_rank` with the field weights. Type and tag filters, and a tag list per scope.)

**Comments**
16. ✅ Comments API: replies, resolve, edit and delete. (Comment rules live in `AccessPolicy.commentPermissions`; view-only people read comments; deleted comments disappear with their replies; the open-comment count on gallery cards moves to step 28.)
17. ✅ Feedback panel with the version filter. (Feedback is the first, default tab; the comment box comes first, then *Show feedback for:* this version / all versions; open and resolved threads together, oldest first, with replies folded until opened; comments are plain text with `http(s)` links opening in a new tab.)

**MCP**
18. ✅ API tokens, the Settings page and Bearer authentication. (Tokens are `ah_` + 256 random bits, stored as SHA-256, at most 20 live per user, revoked by their owner only. Token routes need a session, so a token can't mint tokens. Authentication is one global `AuthGuard` running a `RequestAuthenticator` per scheme (session, API token), registered with `AuthModule.register`; routes accept a session unless `@Auth('api_token')` says otherwise, and requests with a token are rate limited per user. Invalid credentials are refused even if another accepted scheme would pass. Settings shows the secret once and fills it into the Claude Desktop and Claude Code setup.)
19. ✅ MCP server with the read tools: `find_artifacts`, `get_artifact`, `get_feedback`. (Stateless Streamable HTTP at `POST /mcp` with JSON responses, a fresh server per request bound to the caller; GET and DELETE answer 405. Tools come from providers grouped by concern (`mcp/artifacts/`, `mcp/feedback/`) and call the same services as the REST API; `McpServerService` turns `AppError`s into `isError` results with a next step, and hides unexpected errors behind the request ID. Results are data only, no server-side prose: `structuredContent` plus the same JSON as text, with the web URL, `next_actions` and a note that text written by people is data, not instructions (also in the server instructions). Artifacts are named by id or page URL (`?v=N` picks the version). `get_artifact` shows the access summary to its owner only, without the link URL. `get_feedback` returns at most 30 threads and 10 replies each, saying when it cuts. Our request auth moved to `req.authentication`: the SDK reads `req.auth` as its own `AuthInfo`.)
20. ✅ MCP write tools with inline text content. (`publish_artifact` and `update_artifact` (`mcp/publishing/`), `add_comment` and `resolve_comment` (`mcp/feedback/`), `share_artifact` and `manage_access` (`mcp/sharing/`), all through the same services as the web app. `/mcp` gets its own JSON body limit (twice `MAX_ARTIFACT_BYTES`, for escaping); other routes keep 100 kB. Validation errors come back as their field messages, and a tool can give its own hint. Content refusals carry a reason code (`UNSUPPORTED_TYPE` details), so MCP words them for text sent inline while the web app keeps talking about files. Tool annotations mark the read-only tools and `manage_access` as destructive, and descriptions tell the agent to share or remove access only when the user asks. Dedupe of repeated publishes and comments is step 22.)
21. ✅ Upload sessions: browser upload page first, then the direct `PUT`. (`publish_artifact` without `content` creates a draft and an upload; `update_artifact` with `request_upload` asks for the next version, with its change note. Both return `upload.url`, `upload.command`, `upload.expires_at` and what to do next. `uploads/sessions/` is its own module, because `ArtifactsModule` already imports `UploadsModule`. Finishing an upload is `addVersion` on the artifact, which publishes a draft. The session is consumed with one conditional `UPDATE`, released if the pipeline refuses the file, and a repeat after success returns the artifact without reading the new body. Someone else's token or session gets a 404. `PUT` takes only an API token and the raw body (a body a parser already read is refused); the page uses the session cookie. The `/upload/:token` page covers open, uploaded, already uploaded, expired and unknown links, and signed-out users come back to it after logging in. Found while testing it: every rejected upload (this page, `PUT`, and the existing publish and new-version uploads) is now answered only after the rest of its body has arrived, up to the size limit. Answering while the client was still sending made proxies (Vite's dev proxy, a hosting edge) return an empty 502 instead of the reason.)

**Hardening**
22. ✅ `Idempotency-Key` header and MCP dedupe. (`common/idempotency/`: `IdempotencyService.run` claims the key with one `INSERT … ON CONFLICT`, which also takes over a key older than 24 h, then does the work; the key is released if it fails, so only success is remembered. A repeat while the first is running, or with another route or body, is a `409`. The fingerprint is a hash of the validated input as canonical JSON; for uploads, of the metadata and the filename, not the file's bytes (only a bug in our own client could reuse a key for another file). Replays answer with the resource as it is now (like an upload session's repeat), with `Idempotent-Replayed: true`, so the table keeps no copies of responses. The web app sends a key per submission (`submissionKey`, one per mutation variables object) on publish, new version and comment, and retries those on network and server errors. Sharing with people takes no key: sharing again only updates the person's row. MCP: `publish_artifact` returns the user's artifact whose v1 has the same bytes and format from the last 10 minutes (`deduplicated: true`); `update_artifact` adds no version when the content equals the current version (`unchanged: true`), still applying new details; `add_comment` returns the same comment (author, version, parent, body) from the last 2 minutes.)
23. ✅ Sweeper. (`SweeperService` runs the cleanups of the modules that own the data: `ArtifactsService.deleteUnusedBlobs` (storage keys under `artifacts/` older than 1 h that no version has, checked 500 at a time; soft-deleted artifacts keep theirs) and `deleteAbandonedDrafts`, `UploadSessionsService.deleteExpired`, `IdempotencyService.deleteExpired`, and the storage driver's `deleteIncompleteWrites` for `*.tmp` files left by a crash. These maintenance methods take no `Actor` and are never exposed (CLAUDE.md). The first sweep runs a minute after boot, so frequent redeploys don't keep putting it off, then every `SWEEP_INTERVAL_MINUTES`; the next is scheduled when one ends, so they never overlap on the one replica. A failing cleanup is logged and the others still run; each sweep logs its counts. `StorageDriver` gained `list(prefix, olderThan)` and `deleteIncompleteWrites(olderThan)`.)

**AI**
24. ✅ `AiService`, circuit breaker and `/api/config`. (`ai/`: `AiProvider` chosen by `AI_PROVIDER` in a factory, like `StorageDriver`; `AnthropicProviderService` asks for structured output from the zod schema, and reports refusals, `max_tokens` stops and non-JSON as unusable answers. `AiService` gives each call a deadline (`AI_TIMEOUT_MS` fast, `AI_SMART_TIMEOUT_MS` smart; retry included, and enforced even if a provider hangs), retries once on 408/409/429/5xx/network, validates the answer with the schema, and logs model, tokens and latency, never prompts. Its `CircuitBreaker` opens after `AI_CIRCUIT_FAILURE_THRESHOLD` provider failures in a row, logs `AI_UNAVAILABLE` once, and lets one trial call through after the cool-down; unusable answers don't count. Without a provider, `features.ai` is false. User text goes in `<untrusted_content>` blocks. AI routes are rate limited per user.)
25. Metadata suggestions and the background job that fills blank fields.
26. ✅ Feedback summary in the Feedback tab. (`comments/summaries/`: `POST` summarizes on request with the smart model, `GET` returns the saved one with `outdated`. Comments are sent as `[c1]`-style refs, mapped back to ids, oldest threads first within a 60 000-character budget (`partial` when some are left out). Saved per artifact and set of versions: viewers limited to pinned versions get summaries of those only, so no summary leaks comments they can't see. A hash of the input, not a watermark, decides when it's outdated, so edits, resolves and deletes count too. Without AI or when it fails: `503 AI_UNAVAILABLE`, and the saved summary stays. The Feedback tab has a *Summarize feedback* button (for this version or all versions, as the filter says) opening a dialog: the saved summary, or a new one written on opening if there is none; the overview, themes (status, sentiment, how many comments) and disagreements; *Outdated* with *Refresh* once comments change. Hidden without AI or comments.)
27. ✅ Natural-language search, in the gallery only. (`GET /api/search/interpret` turns the text into the list's filters with the fast model: keywords, scope, type, a tag in use (an unknown tag becomes a keyword), owner and dates (UTC days, inclusive); anything invalid is dropped. The search bar keeps its instant keyword search (Enter applies it at once); an *AI search* button, shown only with `features.ai`, opens a dialog whose description replaces the filters (and the tab, if it asks for another), with owner and dates as removable chips. If AI can't read it, the words are searched as they are, with a toast saying so. `GET /api/artifacts` and `find_artifacts` gained `owner` (part of the name, or the exact email) and `updatedFrom` / `updatedTo`; MCP has no server-side LLM step, since the calling agent fills the filters itself.)

**Ship**
28. Seed data, thumbnails, open-comment counts on gallery cards, polish, WRITEUP.md, walkthrough, session logs and the `.claude/` directory.

**Cut line if behind** (drop in this order): NL search → falls back to plain full-text search; direct `PUT` upload (keep browser upload page); thumbnails → type icons; links without sign-in (step 14) → sharing inside the company only.

---

## 18. Out of scope (documented in WRITEUP)

- SSO / email verification / password reset (see ENHANCEMENTS.md)
- Real S3/Azure drivers (interface only)
- Multi-file HTML bundles (zip)
- Teams / orgs / groups for sharing
- Notifications (email/Slack)
- Inline/positional annotations on artifacts (the `anchor` column is reserved)
- Horizontal scaling (local volume pins us to one replica)
