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
| LLM | Claude API behind an `AiService` interface; models configurable via env |
| Logging | `nestjs-pino`, structured JSON, request IDs carried through every step |
| Packaging | pnpm workspace monorepo; one production image (Nest serves the built SPA) |
| Hosting | Railway: one app service + Railway Postgres + Railway Volume for blobs |

### Product rules
- **Everything requires authentication** except signup and login. No anonymous viewing or commenting, and no public share pages.
- **Visibility:** `public` = visible to and commentable by every logged-in user. `private` = owner only, plus whoever a share grants access to.
- **Share audience:** a share gives `view` or `comment` access (`comment` includes `view`) to either:
  - `anyone_with_link`: any logged-in user who opens the link, or
  - `specific_users`: the owner enters emails; each is resolved to an existing user and stored as a **relation** (`share_recipients.user_id → users.id`), never as a plain email. If any email is unknown, the whole request fails with a list of the unknown emails (no verification yet, see ENHANCEMENTS.md).
  - Expiration is optional, and the owner can revoke a share at any time.
- **Versioning:** new content means a new immutable version. Changing metadata (title, description, tags, visibility) does not create a version.
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
│  │  │  ├─ auth/             # signup/login/logout, sessions, session guard
│  │  │  ├─ users/
│  │  │  ├─ api-tokens/       # create/list/revoke PATs, bearer guard
│  │  │  ├─ storage/          # StorageDriver interface + local/s3/azure drivers
│  │  │  ├─ artifacts/        # artifacts + versions, content streaming
│  │  │  ├─ uploads/          # upload sessions (MCP binary flow), content validation
│  │  │  ├─ access/           # AccessPolicy: the only place authorization is decided
│  │  │  ├─ sharing/          # shares, recipients, redemptions
│  │  │  ├─ comments/         # comments, replies, resolve
│  │  │  ├─ search/           # FTS + NL query → structured filters
│  │  │  ├─ ai/               # AiService (Claude), enrichment jobs, feedback summaries
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
  visibility enum('public','private'),
  current_version_id FK NULL, latest_version_no int default 0,
  status enum('draft','published')           -- draft = awaiting first upload (MCP upload session)
  metadata_source enum('user','ai','mixed'),
  search_vector tsvector (generated: title A, tags B, description C, extracted text D),
  created_at, updated_at, deleted_at NULL

artifact_versions                             -- immutable
  id uuid PK, artifact_id FK, version_no int, UNIQUE(artifact_id, version_no),
  storage_key, mime_type, size_bytes, sha256 char(64), original_filename,
  change_note, extracted_text (truncated, for search/AI), created_by FK, created_at

upload_sessions
  id uuid PK, token_hash UNIQUE, user_id FK, artifact_id FK,
  purpose enum('create','new_version'), change_note,
  expires_at, consumed_at NULL, resulting_version_id NULL, created_at

shares
  id uuid PK, artifact_id FK, created_by FK, token_hash UNIQUE,
  permission enum('view','comment'), audience enum('anyone_with_link','specific_users'),
  pinned_version_id NULL (NULL = always latest), expires_at NULL, revoked_at NULL, created_at

share_recipients                              -- for specific_users
  share_id FK, user_id FK, PK(share_id, user_id)

share_redemptions                             -- for anyone_with_link; populates "Shared with me"
  share_id FK, user_id FK, first_opened_at, PK(share_id, user_id)

comments
  id uuid PK, artifact_id FK, version_id FK, parent_id FK NULL (replies only one level deep),
  author_id FK, body text (≤ 5000), anchor jsonb NULL (reserved: region/page),
  resolved_at NULL, resolved_by NULL, edited_at NULL, deleted_at NULL, created_at

feedback_summaries
  id uuid PK, artifact_id FK, version_id FK NULL (NULL = all versions),
  summary jsonb, comment_watermark (max comment created_at included), model, created_at

ai_jobs
  id uuid PK, kind enum('enrich_metadata','extract_text'), artifact_version_id FK,
  status enum('pending','running','done','failed'), attempts, last_error, created_at, updated_at

idempotency_keys
  key, user_id, route, request_hash, response_status, response_body jsonb,
  created_at, PK(user_id, key)                -- TTL 24h, pruned on schedule
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
| Any user, artifact `public` | ✓ | ✓ | ✗ |
| Recipient of a valid `specific_users` share | ✓ | if permission=comment | ✗ |
| Redeemer of a valid `anyone_with_link` share | ✓ | if permission=comment | ✗ |
| Everyone else | ✗ (respond **404**, not 403, so existence isn't revealed) | ✗ | ✗ |

A share is **valid** if it is not revoked and `expires_at` is null or in the future. These checks run on every request, so revoking or expiring a share removes access immediately, including from "Shared with me".

Comment rules: a reply's parent must be top-level and on the same version. Resolve/reopen is allowed only for the author of a top-level comment. Edit/delete is allowed only for the author (soft delete keeps the thread intact).

When a share is pinned to a version, its recipients see only that version.

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

- The content endpoint is `GET /api/artifacts/:id/versions/:no/content`. It is authenticated with the session cookie and passes through `AccessPolicy`.
- Response headers on every content response:
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: sandbox allow-scripts allow-popups; default-src 'self' data: blob: 'unsafe-inline'; …`. Without `allow-same-origin`, the document gets an opaque origin, so its scripts cannot read app cookies or call the API.
  - `Cross-Origin-Resource-Policy: same-origin`, `Referrer-Policy: no-referrer`
- The SPA renders HTML, SVG and PDF in an `<iframe sandbox="allow-scripts allow-popups">`; images use `<img>`; Markdown is rendered with `react-markdown` (no raw HTML) + sanitize.
- The CSRF guard rejects state-changing requests with `Origin: null` or a foreign `Origin`.
- `Download` sets `Content-Disposition: attachment` with a sanitized filename.
- Later hardening (ENHANCEMENTS.md): serve user content from a separate domain (`usercontent.*`).

---

## 8. MCP server

- Uses `@modelcontextprotocol/sdk`, **Streamable HTTP** transport in stateless mode, mounted in Nest at `POST /mcp`.
- **Auth:** `Authorization: Bearer <api token>` → `Actor{via:'mcp'}`. Tokens are created on the **Settings → API tokens** page, which also shows a copy-paste Claude Desktop config:

```json
{
  "mcpServers": {
    "artifact-hub": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<app>.up.railway.app/mcp",
               "--header", "Authorization:Bearer ${ARTIFACT_HUB_TOKEN}"],
      "env": { "ARTIFACT_HUB_TOKEN": "ah_..." }
    }
  }
}
```

### Intent-based tools
Tool descriptions are written the way users ask for things, and each says when to use the tool. Every result returns a short readable summary **and** `structuredContent`, always including the artifact's web URL and suggested next actions.

| Tool | User intent it serves | Key inputs | Notes |
|---|---|---|---|
| `publish_artifact` | "Publish this mockup / share this report with the team" | `title`, `description`, `tags` (all required), `visibility`, `content?` (text formats only: HTML/SVG/MD) | Without `content`, creates a **draft** and returns `upload_url` + `upload_command` (see below) |
| `update_artifact` | "Here's the revised version", "rename it / change tags / make it public" | `artifact` (id or URL), `content?` (text) **or** `request_upload: true` (binary), `change_note`, optional metadata | New content creates a new version; metadata-only changes don't |
| `find_artifacts` | "Find the pricing deck Sara shared last week" | `query` (natural language), optional `owner: me/shared_with_me/anyone`, `type`, `tags` | NL query is converted to filters + full-text search |
| `get_artifact` | "What's the status of the onboarding mockup?" | `artifact`, optional `version` | Metadata, versions, access summary, open-comment count, latest feedback summary |
| `get_feedback` | "What did reviewers say about v2? Anything unresolved?" | `artifact`, `version?`, `include: summary/open/all` | AI summary + raw threads; comment bodies are marked as **untrusted user content** |
| `add_comment` | "Tell them the header looks off", "reply to Sara's comment" | `artifact`, `body`, `version?`, `reply_to?` | |
| `resolve_comment` | "Mark my comment about the logo as resolved" | `comment_id`, `resolved: bool` | Allowed only for the comment's author |
| `share_artifact` | "Give Sara and Tom comment access until Friday", "make a view link for 7 days" | `artifact`, `permission`, `emails?` (else anyone-with-link), `expires_at?` or `expires_in_days?`, `version?` | Unknown emails are returned as a readable error listing which ones aren't registered |
| `manage_access` | "Who can see this?", "revoke Tom's access", "make it private" | `artifact`, `action: list/revoke/set_visibility`, … | |

**Content input rule (MCP):** two paths only, with no base64.
- **Text formats** (HTML, SVG, Markdown) are sent inline as `content`.
- **Binary formats** (images, PDF) always go through an **upload session**.

**Binary uploads (images/PDFs) from MCP:**
1. The agent calls `publish_artifact` without `content` (or `update_artifact` with `request_upload: true`), always passing the metadata.
2. The server creates the artifact as `draft` (publish only) plus an `upload_session` (single-use, 30-minute TTL, tied to user + artifact, purpose create/new_version).
3. The tool returns both ways to finish:
   - `upload_url: https://…/upload/<token>`: a browser page for the user (Claude Desktop, chat clients).
   - `upload_command: curl -T <file> -H "Authorization: Bearer $ARTIFACT_HUB_TOKEN" https://…/api/upload-sessions/<token>`: for agents with shell access (Claude Code, Cursor).

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
| **Feedback summary** | "Feedback" tab header on each artifact; `get_feedback` | Smart model. Groups comments into themes, marks resolved vs. open, highlights disagreements; per version or across versions. Cached in `feedback_summaries`, regenerated when new comments exist (watermark) |
| **Natural-language search** | Gallery search bar; `find_artifacts` | Fast model turns the query into `{ keywords, tags, type, owner, date range }` → Postgres full-text search (`websearch_to_tsquery`) + filters. Falls back to plain full-text search if the LLM fails. No extra embeddings provider needed |

### 9.1 Graceful degradation (AI not configured or failing)

**Principle:** AI only adds to the experience; it is never needed to complete a task. No user action waits on, or fails because of, an LLM call.

**Mechanics:**
- `AiService` has two implementations: `ClaudeAiService` and `NoopAiService`. The Noop version is selected at boot when `AI_ENABLED=false` or there is no API key, and a warning is logged once.
- `GET /api/config` exposes `features.ai: boolean` so the SPA hides AI elements instead of showing broken ones.
- Each runtime call has a timeout, makes 1 retry for retryable errors (429/5xx/timeout), and has a circuit breaker: after N consecutive failures, AI calls are skipped for a cool-down period (`AI_UNAVAILABLE` is logged, not shown to the user).
- AI errors never reach the global exception filter as 5xx errors; each feature catches them and falls back.

| Feature | AI not configured | AI configured but fails / times out |
|---|---|---|
| Upload form pre-fill | Form shows empty fields; **title becomes required** in the web UI (default: filename without extension); description/tags optional | Suggestions request times out after about 8 s → form stays editable throughout (never disabled while waiting); a subtle "Couldn't suggest details" hint; user can publish immediately |
| Async fill of blank metadata | Job not enqueued; fields stay empty | Job retries up to 3 times with backoff, then marked `failed`; artifact stays published and fully usable |
| Feedback summary | Panel hidden; raw comment threads shown as usual | Last cached summary is shown with an "outdated" badge, or the panel is hidden with "Summary unavailable"; threads always shown |
| Natural-language search | Search bar does plain full-text search + filter controls | Falls back to plain full-text search on the raw query (logged); results are never empty because of AI failure |
| MCP `get_feedback` / `get_artifact` | Return raw comments; `summary: null` with `summary_unavailable_reason` | Same, so the client agent can summarize the raw comments itself |
| MCP `find_artifacts` | Plain full-text search | Plain full-text search |

**Tests:** the e2e suite runs the core flows with `NoopAiService`, and there's a test with a failing AI stub (it throws or hangs) to verify that publish, search and feedback still succeed.

**LLM hygiene:** user content is placed inside clearly delimited `<untrusted_content>` blocks with an instruction to treat it as data; no tools are given to these LLM calls; outputs must pass schema validation or are discarded; input text is truncated to a size budget; per-user rate limits apply to AI endpoints; token usage is logged.

---

## 10. Error handling and idempotency

### Errors
- Domain errors are defined in `packages/shared` with stable codes: `NOT_FOUND`, `FORBIDDEN`, `VALIDATION_FAILED`, `ARTIFACT_TOO_LARGE`, `UNSUPPORTED_TYPE`, `UPLOAD_SESSION_EXPIRED`, `UPLOAD_SESSION_USED`, `SHARE_RECIPIENT_UNKNOWN`, `RATE_LIMITED`, `CONFLICT`, `AI_UNAVAILABLE`, ….
- A global exception filter maps them to HTTP status + `{ error: { code, message, details?, requestId } }`. The MCP adapter maps them to `isError` tool results.
- Unknown errors are logged with stack and request ID; the client sees a generic message plus the `requestId`.
- The web UI uses typed API client errors with toasts / inline form errors and retry on network failures for idempotent calls.

### Idempotency (critical write paths)
| Operation | Mechanism |
|---|---|
| Web publish / new version / comment / share create | `Idempotency-Key` header (UUID generated per form submission). Stored with the request hash and response; a replay returns the stored response; same key with a different body → `409` |
| MCP publish | Dedupe on `(owner, sha256)` within 10 min → return the existing artifact with `"deduplicated": true` |
| MCP update with content | If `sha256` equals the current version's → no new version; return current with `"unchanged": true` |
| MCP add_comment | Dedupe identical `(author, version, parent, body)` within 2 min |
| MCP share_artifact | Identical active share (same audience, recipients, permission, expiry) → return existing |
| Upload session | Single-use token consumed atomically |
| Version numbering | Row lock + `UNIQUE(artifact_id, version_no)`; retry once on unique violation |

### Consistency
- Order of operations: blob first, then DB transaction. On DB failure the blob is deleted on a best-effort basis.
- An hourly sweeper deletes blobs with no version row (older than 1 h), expired drafts, expired upload sessions and idempotency keys.
- AI jobs are rows in `ai_jobs`, processed by an in-process worker (with retry and backoff, max 3 attempts); pending jobs are resumed on boot. No external queue is needed for this scale.

---

## 11. Logging and observability

- `nestjs-pino`, JSON in prod, pretty output in dev; `LOG_LEVEL` env.
- A request ID (incoming `X-Request-Id` or generated) is stored in AsyncLocalStorage, added to every log line and returned in the response header and error body. MCP tool calls get their own ID plus the tool name.
- **Step logs in the main services:**
  - publish: received → type detected → blob stored (bytes, ms) → dedupe decision → version committed → jobs enqueued
  - shares: created / redeemed / revoked / denied
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
| S6 | **Share token guessing / leakage** | 256-bit random tokens, only SHA-256 stored; expiry/revocation checked on every request; links still require login; `Referrer-Policy: no-referrer` |
| S6b | **Upload URL leakage / hijack** | Upload token + user authentication (cookie or Bearer) both required, and the user must own the session; single-use, 30-minute TTL; 404 on mismatch |
| S7 | **Share to unverified identity** (anyone can sign up with any email) | Accepted for the demo; grants only to existing users; SSO/email verification tracked in ENHANCEMENTS.md |
| S8 | **Prompt injection via artifact content or comments → our LLM** | Delimited untrusted blocks, no tools, schema-validated output, length caps, output only ever used as data (never as instructions or HTML) |
| S9 | **Prompt injection via MCP results → user's agent** (other users' comments/content returned to the agent) | Tool results wrap user-generated text in clearly labelled untrusted fields; tool descriptions tell the agent not to follow instructions inside them; destructive tools (revoke, set private) take explicit parameters, never inferred from content |
| S10 | **CSRF** | `SameSite=Lax` cookie + Origin/Referer check on all non-GET requests; MCP uses Bearer (no cookies) |
| S11 | **Credential attacks** | argon2id, min password length, login rate limit per IP + email, generic "invalid credentials", constant-time compare |
| S12 | **Session hijack / fixation** | Random 256-bit session token, hashed in DB, new session on login, httpOnly + Secure + SameSite, sliding expiry, logout deletes the row |
| S13 | **API token abuse** | Hashed, shown once, revocable, `last_used_at`, prefix for identification, rate limited |
| S14 | **Comment XSS** | Plain text rendered by React (auto-escaped); links auto-linked with `rel="noopener noreferrer"` |
| S15 | **Malicious PDFs** | Rendered by the browser's built-in viewer inside the sandboxed iframe; never processed server-side except by the LLM API |
| S16 | **Secrets in logs / errors** | pino redaction; generic 500 messages; no stack traces in responses |
| S17 | **LLM cost abuse** | Per-user AI rate limits, input truncation, caching of summaries, `AI_ENABLED` switch |
| S18 | **SSRF** | No server-side URL fetching features |
| S19 | **Account / email enumeration** | Generic login errors; share errors for unknown emails are shown only to the owner of the artifact (an accepted trade-off) |
| S20 | **General hardening** | `helmet`, strict CSP for the SPA itself, `@nestjs/throttler`, env validated at boot, non-root container user |

---

## 13. REST API (summary)

```
POST   /api/auth/signup | /login | /logout        GET /api/auth/me
GET    /api/tokens   POST /api/tokens   DELETE /api/tokens/:id

GET    /api/artifacts?q=&scope=mine|shared|public&type=&tag=&cursor=
POST   /api/uploads/preview                       (multipart → detected type + AI suggestions)
POST   /api/artifacts                             (multipart: file + metadata)          [Idempotency-Key]
GET    /api/artifacts/:id
PATCH  /api/artifacts/:id                         (metadata / visibility)
DELETE /api/artifacts/:id                         (soft delete)
POST   /api/artifacts/:id/versions                (multipart: file + change_note)        [Idempotency-Key]
GET    /api/artifacts/:id/versions
GET    /api/artifacts/:id/versions/:no/content    (sandboxed stream; ?download=1)

GET    /api/artifacts/:id/comments?version=&include=all
POST   /api/artifacts/:id/comments                (body, version?, parentId?)            [Idempotency-Key]
PATCH  /api/comments/:id                          (edit body | resolved)
DELETE /api/comments/:id
GET    /api/artifacts/:id/feedback-summary?version=

GET    /api/artifacts/:id/shares   POST /api/artifacts/:id/shares   DELETE /api/shares/:id
GET    /api/s/:token                              (redeem → artifact id, permission)

GET    /api/upload-sessions/:token                (session cookie; owner only → draft info for the upload page)
POST   /api/upload-sessions/:token                (multipart from upload page; session cookie; owner only)
PUT    /api/upload-sessions/:token                (raw body; Bearer API token; owner only; for agents with shell access)
GET    /api/health
POST   /mcp
```

---

## 14. Web UI

| Screen | Purpose |
|---|---|
| Login / Signup | Simple, one demo account hint on the login page |
| **Gallery** (home) | Tabs: *All public* · *Mine* · *Shared with me*. Card grid with live thumbnails (image / first PDF page via `<img>`/iframe preview, HTML in a scaled sandboxed iframe), type badge, tags, owner, open-comment count, updated time. NL search bar + tag/type filters |
| **Artifact page** | Large viewer on the left; right panel tabs: *Feedback* (AI summary at top, threads with replies, resolve, version filter "this version / all versions"), *Versions* (list, switch, change notes), *Details* (metadata, edit if owner). Header actions: Share, Upload new version, Download, Open full screen |
| **Share dialog** | Visibility toggle; create link (view/comment, anyone-with-link or emails with autocomplete of existing users, expiry presets: 1 day / 7 days / 30 days / never); list of active shares with copy + revoke |
| **Publish dialog** | Drag-and-drop → AI pre-fill → edit → publish (visibility default private) |
| **Upload page** (`/upload/:token`) | Landing page for the MCP binary flow: shows the artifact name the agent created, a drop zone, and a success state ("You can return to your conversation") |
| **Settings** | API tokens + ready-to-copy Claude Desktop config |
| Share link (`/s/:token`) | Login if needed → redeem → redirect to artifact page; clear "expired / revoked" state |

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
MAX_ARTIFACT_BYTES=10485760
UPLOAD_SESSION_TTL_MINUTES=30
AI_ENABLED=true, ANTHROPIC_API_KEY, AI_MODEL_FAST, AI_MODEL_SMART  (all optional; app runs without them)
AI_TIMEOUT_MS=8000, AI_CIRCUIT_FAILURE_THRESHOLD=5, AI_CIRCUIT_COOLDOWN_SECONDS=60
RATE_LIMIT_LOGIN_PER_IP=20, RATE_LIMIT_LOGIN_PER_EMAIL=10, RATE_LIMIT_LOGIN_WINDOW_SECONDS=900
RATE_LIMIT_* (upload, ai: added with those features)
SEED_DEMO=true
```

---

## 16. Testing strategy

- **Unit:**
  - `AccessPolicy` (full matrix of roles × visibility × share states)
  - content-type detection
  - local storage driver (traversal, atomic writes)
  - idempotency service
  - NL-search parser fallback
  - AI output validation
- **E2E (supertest + real Postgres via compose):**
  - signup/login/session
  - publish → version → comment/reply/resolve
  - share flows (expiry, revoke, specific users, anyone-with-link)
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
8. Create an artifact with v1, get one, list mine. `AccessPolicy` starts as owner-only.
9. Content endpoint with sandbox headers, and a viewer for each type.
10. Publish dialog and the gallery's *Mine* tab, without AI.
11. New versions, metadata edits, soft delete, and the Versions and Details tabs.

**Access and sharing**
12. Public visibility and the *All public* tab, plus the full `AccessPolicy` test matrix.
13. Anyone-with-link shares: expiry, revoke, redeem, and the `/s/:token` page.
14. Shares to specific users, the *Shared with me* tab and the share dialog.
15. Plain full-text search and filters in the gallery.

**Comments**
16. Comments API: replies, resolve, edit and delete.
17. Feedback panel with the version filter.

**MCP**
18. API tokens, the Settings page and the Bearer guard.
19. MCP server with the read tools: `find_artifacts`, `get_artifact`, `get_feedback`.
20. MCP write tools with inline text content.
21. Upload sessions: browser upload page first, then the direct `PUT`.

**Hardening**
22. `Idempotency-Key` header and MCP dedupe.
23. Sweeper.

**AI**
24. `AiService` with its Noop fallback, circuit breaker and `/api/config`.
25. Metadata suggestions and the background job that fills blank fields.
26. Feedback summary.
27. Natural-language search.

**Ship**
28. Seed data, thumbnails, polish, WRITEUP.md, walkthrough, session logs and the `.claude/` directory.

**Cut line if behind** (drop in this order): NL search → falls back to plain full-text search; direct `PUT` upload (keep browser upload page); thumbnails → type icons.

---

## 18. Out of scope (documented in WRITEUP)

- SSO / email verification / password reset (see ENHANCEMENTS.md)
- Real S3/Azure drivers (interface only)
- Multi-file HTML bundles (zip)
- Teams / orgs / groups for sharing
- Notifications (email/Slack)
- Inline/positional annotations on artifacts (the `anchor` column is reserved)
- Horizontal scaling (local volume pins us to one replica)
