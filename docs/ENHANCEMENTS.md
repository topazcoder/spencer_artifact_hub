# Enhancements Backlog

Known limitations of the current build, and planned improvements.

## Identity and access

### SSO + verified identities (high priority)

**Current state:** Signup takes an email + password without verification. Sharing with specific users only checks that an account with that email exists.

**Risk:** Anyone can register with someone else's email (e.g. `bob@corp.com`) before Bob does, and then receive anything shared with that address.

**Planned:**
- Add SSO (OIDC — e.g. Google Workspace / Microsoft Entra ID) as the primary login, so emails are verified by the identity provider.
- Restrict signup to company domains; disable password signup once SSO is live (or require email verification for it).
- Allow sharing with emails that are not registered yet: create a pending grant that is attached to the account on first SSO login. Schema change: add a separate `share_invites(share_id, email)` table, converted into `share_recipients` rows on first login. `share_recipients` itself keeps a strict `user_id` foreign key.
- Add group/team-based sharing synced from the identity provider.

### Password lifecycle
- Password reset via email, password change, and session management UI ("log out other devices").

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
