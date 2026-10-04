# Enhancements Backlog

Known limitations of the current build, and planned improvements.

## Identity and access

### SSO + verified identities (high priority)

**Current state:** Signup takes an email + password without verification. Sharing with specific users only checks that an account with that email exists.

**Risk:** Anyone can register with someone else's email (e.g. `bob@corp.com`) before Bob does, and then receive anything shared with that address.

**Planned:**
- Add SSO (OIDC — e.g. Google Workspace / Microsoft Entra ID) as the primary login, so emails are verified by the identity provider.
- Restrict signup to company domains; disable password signup once SSO is live (or require email verification for it).
- Allow sharing with emails that are not registered yet: create a pending grant that is attached to the account on first SSO login. Schema change: add a separate `share_invites(artifact_id, email, permission, pinned_version_id)` table, converted into `shares` rows on first login. `shares` itself keeps a strict `user_id` foreign key.
- Add group/team-based sharing synced from the identity provider.

### Sharing
- Several named links per artifact (e.g. one per client), each with its own expiry and version, revocable separately. One link per artifact covers the common case for now.
- Expiry for people and for company access (today only the link expires).
- Comments from link visitors, with a guest name and spam protection.
- Notify people when something is shared with them (see Platform).

### API tokens
- Optional expiry, and scopes (e.g. read-only tokens for search-only agents).
- OAuth for MCP clients (the MCP authorization spec), so users connect by signing in instead of pasting a token. Its access tokens plug in as one more `RequestAuthenticator`; the MCP TypeScript SDK's auth helpers cover the authorization-server endpoints.
- Warn the owner about tokens unused for a long time, and revoke them automatically after a while.

### Password lifecycle
- Password reset via email, password change, and session management UI ("log out other devices").

### Rate limiting
**Current state:** `@nestjs/throttler` with its default in-memory store limits login attempts per client IP and per email (and signups per IP), over a fixed window. Every attempt counts, successful or not.

**Limitations:**
- Counters live in the process: they reset on restart and are not shared between replicas.
- Memory grows with the number of distinct keys (IPs, emails) seen in a window, so a flood of requests with random emails can inflate it until the window expires.
- Anyone can use up the per-email budget of someone else's account and temporarily lock them out.

**Planned:**
- Move counters to Redis (e.g. `@nest-lab/throttler-storage-redis`): every key gets a TTL equal to its window (`INCR` + `PEXPIRE`), so memory stays bounded and expired entries clean themselves up. Counters are then shared across replicas and survive restarts.
- Cap the in-memory store's size in the meantime (LRU), as a fallback when Redis is not configured.
- Count only failed logins per email, reset the counter after a successful login, and use exponential backoff instead of a hard block, so a targeted lockout is short-lived.

## Idempotency
- MCP dedupe is a lookup before the insert, so two identical `publish_artifact` or `add_comment` calls arriving at the same moment can both go through. Retries come one after another, which it covers; a unique constraint or an advisory lock per `(owner, sha256)` would close the gap.
- `publish_artifact` without content (a draft for an upload) isn't deduplicated: a repeat makes a second draft, which the sweeper removes if it's never uploaded.
- An upload's `Idempotency-Key` fingerprint covers its metadata and filename, not the file's bytes: a repeat with the same key and another file gets the first result. Our client makes a new key per submission, so only a client bug could do this; hashing the file as it streams (and reading a repeat's file to compare) would catch it.
- A request whose process dies mid-way leaves its key "in progress" until it expires (24 h); retries with that key get a `409`, and a new submission (new key) works. Taking over keys stuck in progress after a few minutes would remove that, at the risk of doing work twice.

## Storage and content
- Implement the `s3` and `azure` `StorageDriver`s (interfaces already in place), with optional presigned download URLs.
- Serve user content from a separate domain (`usercontent.<domain>`) as defense in depth beyond the CSP sandbox.
- Multi-file HTML bundles (zip upload with asset rewriting).
- Server-generated thumbnails.
- Stream the local driver's file listing (`opendir` with `recursive: true`): today `list` and `deleteIncompleteWrites` read the whole tree into memory before the sweeper checks the first file. Fine for thousands of files, not for hundreds of thousands. Object storage's paged listing (and lifecycle rules) replaces it at real scale.

## Platform
- Horizontal scaling (requires object storage instead of a local volume, and a real job queue).
- Notifications (email/Slack) for new comments, shares and new versions.
- Positional annotations on artifacts (the `comments.anchor` column is reserved for this).
- Activity feed and persisted audit log (`activity_events` table) once there is collaborative editing, notifications or compliance needs. For now, versions, comments and share timestamps plus structured logs cover this.
