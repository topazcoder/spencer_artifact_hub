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

## Storage and content
- Implement the `s3` and `azure` `StorageDriver`s (interfaces already in place), with optional presigned download URLs.
- Serve user content from a separate domain (`usercontent.<domain>`) as defense in depth beyond the CSP sandbox.
- Multi-file HTML bundles (zip upload with asset rewriting).
- Server-generated thumbnails.

## Platform
- Horizontal scaling (requires object storage instead of a local volume, and a real job queue).
- Notifications (email/Slack) for new comments, shares and new versions.
- Positional annotations on artifacts (the `comments.anchor` column is reserved for this).
- Activity feed and persisted audit log (`activity_events` table) once there is collaborative editing, notifications or compliance needs. For now, versions, comments and share timestamps plus structured logs cover this.
