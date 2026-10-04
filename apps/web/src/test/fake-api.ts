import {
  type ApiToken,
  API_TOKENS_MAX,
  ARTIFACT_TYPE_FILTERS,
  type Artifact,
  type ArtifactListScope,
  type ArtifactMimeType,
  type ArtifactVersion,
  ErrorCode,
  type ArtifactAccess,
  type Comment,
  type FeedbackSummary,
  type SearchInterpretation,
  type SharedPerson,
  type User,
} from '@artifact-hub/shared';
import { vi } from 'vitest';

interface Account {
  user: User;
  password: string;
}

function json(status: number, body?: unknown): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function error(status: number, code: ErrorCode, message: string): Response {
  return json(status, { error: { code, message, requestId: 'test-req' } });
}

const LIST_ROUTE = /^GET \/api\/artifacts\?(.*)$/;
const TAGS_ROUTE = /^GET \/api\/artifacts\/tags\?(.*)$/;
const INTERPRET_ROUTE = /^GET \/api\/search\/interpret\?(.*)$/;
const ARTIFACT_ROUTE = /^(GET|PATCH|DELETE) \/api\/artifacts\/([^/?]+)$/;
const VERSIONS_ROUTE = /^(GET|POST) \/api\/artifacts\/([^/?]+)\/versions$/;
const CONTENT_ROUTE = /^GET \/api\/artifacts\/([^/?]+)\/versions\/(\d+)\/content$/;
const ACCESS_ROUTE = /^GET \/api\/artifacts\/([^/?]+)\/access$/;
const COMPANY_ROUTE = /^PUT \/api\/artifacts\/([^/?]+)\/access\/company$/;
const PEOPLE_ROUTE = /^POST \/api\/artifacts\/([^/?]+)\/access\/people$/;
const PERSON_ROUTE = /^(PATCH|DELETE) \/api\/artifacts\/([^/?]+)\/access\/people\/([^/?]+)$/;
const USER_SEARCH_ROUTE = /^GET \/api\/users\/search\?(.*)$/;
const LINK_ROUTE = /^(PUT|DELETE) \/api\/artifacts\/([^/?]+)\/access\/link$/;
const LINK_RESET_ROUTE = /^POST \/api\/artifacts\/([^/?]+)\/access\/link\/reset$/;
const SHARED_ROUTE = /^GET \/api\/s\/([^/?]+)(\/content)?(\?.*)?$/;
const COMMENTS_ROUTE = /^(GET|POST) \/api\/artifacts\/([^/?]+)\/comments(?:\?(.*))?$/;
const COMMENT_ROUTE = /^(PATCH|DELETE) \/api\/comments\/([^/?]+)$/;
const SUMMARY_ROUTE = /^(GET|POST) \/api\/artifacts\/([^/?]+)\/feedback-summary(?:\?(.*))?$/;
const TOKEN_ROUTE = /^DELETE \/api\/tokens\/([^/?]+)$/;
const UPLOAD_SESSION_ROUTE = /^(GET|POST) \/api\/upload-sessions\/([^/?]+)$/;

const MIME_BY_EXTENSION: Record<string, ArtifactMimeType> = {
  html: 'text/html',
  svg: 'image/svg+xml',
  md: 'text/markdown',
  png: 'image/png',
  pdf: 'application/pdf',
};

function versionOf(file: File, versionNo: number, changeNote: string | null): ArtifactVersion {
  return {
    id: crypto.randomUUID(),
    versionNo,
    mimeType: MIME_BY_EXTENSION[file.name.split('.').pop() ?? ''] ?? 'text/markdown',
    sizeBytes: file.size,
    sha256: '0'.repeat(64),
    originalFilename: file.name,
    changeNote,
    createdAt: new Date().toISOString(),
  };
}

/** What the server answers a natural-language search with, without AI. */
function keywordSearch(q: string, scope: string): SearchInterpretation {
  return { interpreted: false, filters: { scope: scope as ArtifactListScope, q } };
}

/** Like the server: every word must start a word of the title, description or a tag. */
function matches(artifact: Artifact, q: string): boolean {
  const words = `${artifact.title} ${artifact.description} ${artifact.tags.join(' ')}`
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u);
  return (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).every((term) =>
    words.some((word) => word.startsWith(term)),
  );
}

/** A comment as the fake server stores it: without the permissions, which depend on who asks. */
type FeedbackSummaryContent = Pick<FeedbackSummary, 'overview' | 'themes' | 'disagreements'>;

interface StoredComment {
  artifactId: string;
  comment: Omit<Comment, 'permissions'>;
  deleted: boolean;
}

/**
 * Stubs `fetch` with an in-memory version of the API (auth, config, publishing and reading
 * artifacts), so component tests run the real API client, hooks and routes.
 */
export function installFakeApi() {
  const accounts = new Map<string, Account>();
  /** Each artifact with its versions (oldest first) and their content by version number. */
  const artifacts = new Map<
    string,
    { artifact: Artifact; versions: ArtifactVersion[]; content: Map<number, BodyInit> }
  >();
  /** Every publish (or new version) request's form, in the order its parts were appended. */
  const publishedForms: FormData[] = [];
  /** Access settings by artifact id; artifacts without an entry are shared with nobody. */
  const access = new Map<string, ArtifactAccess>();
  /** Every link token handed out, live or not. */
  const linkTokens: { token: string; artifactId: string; revoked: boolean }[] = [];
  let nextPublishResponse: Response | null = null;
  /** Every comment, oldest first, deleted ones included. */
  const comments: StoredComment[] = [];
  let nextCommentResponse: Response | null = null;
  /** While set, list requests wait for it, to show what happens while results load. */
  let listsHeld: Promise<void> | null = null;
  let nextUpdateResponse: Response | null = null;
  let maxArtifactBytes = 10 * 1024 * 1024;
  let aiEnabled = false;
  /** Answers natural-language searches; like the server without AI by default. */
  let interpret = keywordSearch;
  /** Every natural-language search asked for. */
  const interpretRequests: { q: string; scope: string }[] = [];
  /** Saved feedback summaries by `artifactId:versionNo|all`, with the comments they read. */
  const summaries = new Map<string, { summary: FeedbackSummary; commentIds: string }>();
  /** What summarizing writes; an error makes it fail with `AI_UNAVAILABLE`. */
  let summaryContent: FeedbackSummaryContent | Error = {
    overview: 'Reviewers like it overall.',
    themes: [],
    disagreements: [],
  };
  let summarizeCount = 0;
  let signedIn: User | null = null;
  /** The signed-in user's live API tokens, newest first. */
  let apiTokens: ApiToken[] = [];
  /** Upload sessions by token, all the signed-in user's. */
  const uploadSessions = new Map<
    string,
    { artifactId: string; changeNote: string | null; expired: boolean; done: boolean }
  >();

  const publish = (form: FormData): Response => {
    publishedForms.push(form);
    if (nextPublishResponse) {
      const response = nextPublishResponse;
      nextPublishResponse = null;
      return response;
    }
    const metadata = JSON.parse(String(form.get('metadata')));
    const file = form.get('file') as File;
    const now = new Date().toISOString();
    const version = versionOf(file, 1, null);
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      title: metadata.title,
      description: metadata.description ?? '',
      tags: metadata.tags ?? [],
      visibility: metadata.visibility ?? 'private',
      status: 'published',
      metadataSource: 'user',
      owner: { id: signedIn!.id, displayName: signedIn!.displayName },
      currentVersion: version,
      latestVersionNo: 1,
      permissions: { comment: true, edit: true, share: true, delete: true },
      createdAt: now,
      updatedAt: now,
    };
    artifacts.set(artifact.id, { artifact, versions: [version], content: new Map([[1, file]]) });
    return json(201, { artifact: seen(artifact) });
  };

  const publishVersion = (id: string, form: FormData): Response => {
    publishedForms.push(form);
    const stored = artifacts.get(id);
    if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
    if (nextPublishResponse) {
      const response = nextPublishResponse;
      nextPublishResponse = null;
      return response;
    }
    const { changeNote } = JSON.parse(String(form.get('metadata')));
    const file = form.get('file') as File;
    const versionNo = stored.artifact.latestVersionNo + 1;
    const version = versionOf(file, versionNo, changeNote?.trim() || null);
    stored.versions.push(version);
    stored.content.set(versionNo, file);
    stored.artifact = {
      ...stored.artifact,
      currentVersion: version,
      latestVersionNo: versionNo,
      updatedAt: new Date().toISOString(),
    };
    return json(201, { artifact: seen(stored.artifact) });
  };

  /** `artifact` with the permissions the signed-in user has, as the server computes them. */
  const seen = (artifact: Artifact): Artifact => {
    const owner = artifact.owner.id === signedIn?.id;
    const person = accessOf(artifact.id).people.find((p) => p.user.id === signedIn?.id);
    return {
      ...artifact,
      permissions: {
        comment: owner || artifact.visibility === 'public' || person?.permission === 'comment',
        edit: owner,
        share: owner,
        delete: owner,
      },
    };
  };

  const accessOf = (artifactId: string): ArtifactAccess =>
    access.get(artifactId) ?? {
      company: { enabled: false, pinnedVersionNo: null },
      people: [],
      link: null,
    };

  /** A new live link for the artifact; the previous one, if any, stops working. */
  const newLink = (
    artifactId: string,
    expiresAt: string | null,
    pinnedVersionNo: number | null,
  ): ArtifactAccess['link'] => {
    for (const t of linkTokens) if (t.artifactId === artifactId) t.revoked = true;
    const token = `link-${linkTokens.length + 1}`;
    linkTokens.push({ token, artifactId, revoked: false });
    return {
      url: `http://localhost:5173/s/${token}`,
      pinnedVersionNo,
      expiresAt,
      createdAt: new Date().toISOString(),
    };
  };

  /** What a link shows, or why it doesn't. */
  const openLink = (token: string, wantsContent: boolean): Response => {
    const found = linkTokens.find((t) => t.token === token);
    const stored = found && artifacts.get(found.artifactId);
    if (!found || !stored) return error(404, ErrorCode.NOT_FOUND, "This link doesn't work.");
    if (found.revoked) return error(410, ErrorCode.SHARE_REVOKED, 'This link was turned off.');
    const link = accessOf(found.artifactId).link!;
    if (link.expiresAt && link.expiresAt <= new Date().toISOString()) {
      return error(410, ErrorCode.SHARE_EXPIRED, 'This link has expired.');
    }
    const version =
      link.pinnedVersionNo === null
        ? stored.artifact.currentVersion!
        : stored.versions.find((v) => v.versionNo === link.pinnedVersionNo)!;
    if (wantsContent) {
      return new Response(stored.content.get(version.versionNo) ?? '', { status: 200 });
    }
    const { id, title, description, owner } = stored.artifact;
    return json(200, {
      artifact: { id, title, description, owner: { displayName: owner.displayName }, version },
      expiresAt: link.expiresAt,
    });
  };

  const changeAccess = (artifactId: string, next: ArtifactAccess): Response => {
    access.set(artifactId, next);
    const stored = artifacts.get(artifactId);
    if (stored) {
      stored.artifact = {
        ...stored.artifact,
        visibility: next.company.enabled ? 'public' : 'private',
      };
    }
    return json(200, { access: next });
  };

  const sharePeople = (artifactId: string, body: Record<string, unknown>): Response => {
    const emails = (body.emails as string[]).map((email) => email.trim().toLowerCase());
    const unknownEmails = emails.filter((email) => !accounts.has(email));
    if (unknownEmails.length > 0) {
      return json(422, {
        error: {
          code: ErrorCode.SHARE_RECIPIENT_UNKNOWN,
          message: `No one at Artifact Hub has these emails: ${unknownEmails.join(', ')}.`,
          details: { unknownEmails },
          requestId: 'test-req',
        },
      });
    }
    const current = accessOf(artifactId);
    const added: SharedPerson[] = emails.map((email) => {
      const { user } = accounts.get(email)!;
      return {
        user: { id: user.id, displayName: user.displayName, email: user.email },
        permission: body.permission as SharedPerson['permission'],
        pinnedVersionNo: (body.versionNo as number | null | undefined) ?? null,
        sharedAt: new Date().toISOString(),
      };
    });
    const people = [
      ...current.people.filter((p) => !added.some((a) => a.user.id === p.user.id)),
      ...added,
    ];
    const response = changeAccess(artifactId, { ...current, people });
    return new Response(response.body, { status: 201, headers: response.headers });
  };

  const searchUsers = (query: URLSearchParams): Response => {
    const q = (query.get('q') ?? '').toLowerCase();
    const items = [...accounts.values()]
      .map(({ user }) => user)
      .filter((user) => user.id !== signedIn?.id)
      .filter(
        (user) =>
          user.email.toLowerCase().startsWith(q) || user.displayName.toLowerCase().startsWith(q),
      )
      .slice(0, 5)
      .map(({ id, displayName, email }) => ({ id, displayName, email }));
    return json(200, { items });
  };

  /** The signed-in user's artifacts in a gallery scope. */
  const inScope = (scope: string): Artifact[] =>
    [...artifacts.values()]
      .map(({ artifact }) => artifact)
      .filter((artifact) => {
        if (scope === 'public') return artifact.visibility === 'public';
        if (scope === 'shared') {
          return (
            artifact.owner.id !== signedIn?.id &&
            accessOf(artifact.id).people.some((p) => p.user.id === signedIn?.id)
          );
        }
        return artifact.owner.id === signedIn?.id;
      });

  const listArtifacts = (query: URLSearchParams): Response => {
    const page = Number(query.get('page') ?? 1);
    const pageSize = Number(query.get('pageSize') ?? 24);
    const q = query.get('q');
    const type = query.get('type') as keyof typeof ARTIFACT_TYPE_FILTERS | null;
    const tag = query.get('tag');
    const owner = query.get('owner')?.toLowerCase();
    const from = query.get('updatedFrom');
    const to = query.get('updatedTo');
    const matching = inScope(query.get('scope') ?? 'mine')
      .filter((artifact) => !q || matches(artifact, q))
      .filter(
        (artifact) =>
          !type ||
          (ARTIFACT_TYPE_FILTERS[type] as readonly string[]).includes(
            artifact.currentVersion?.mimeType ?? '',
          ),
      )
      .filter((artifact) => !tag || artifact.tags.includes(tag))
      .filter((artifact) => !owner || artifact.owner.displayName.toLowerCase().includes(owner))
      .filter((artifact) => !from || artifact.updatedAt.slice(0, 10) >= from)
      .filter((artifact) => !to || artifact.updatedAt.slice(0, 10) <= to)
      .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const items = matching.slice((page - 1) * pageSize, page * pageSize).map(seen);
    return json(200, { items, page, pageSize, total: matching.length });
  };

  const listTags = (query: URLSearchParams): Response => {
    const counts = new Map<string, number>();
    for (const artifact of inScope(query.get('scope') ?? 'mine')) {
      for (const tag of artifact.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const items = [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .toSorted((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return json(200, { items });
  };

  /** Like the server: summaries are saved per version, and outdated once the comments change. */
  const feedbackSummary = (
    method: string,
    artifactId: string,
    query: URLSearchParams,
  ): Response => {
    const versionNo = query.get('version') ? Number(query.get('version')) : null;
    const read = comments.filter(
      (c) =>
        c.artifactId === artifactId &&
        !c.deleted &&
        (versionNo === null || c.comment.versionNo === versionNo),
    );
    const key = `${artifactId}:${versionNo ?? 'all'}`;
    const commentIds = read.map((c) => `${c.comment.id}:${c.comment.resolvedAt}`).join(',');
    const saved = read.length > 0 ? summaries.get(key) : undefined;
    const outdated = saved !== undefined && saved.commentIds !== commentIds;
    if (method === 'GET' || read.length === 0 || (saved && !outdated)) {
      return json(200, { summary: saved?.summary ?? null, outdated });
    }
    if (summaryContent instanceof Error) {
      return error(503, ErrorCode.AI_UNAVAILABLE, summaryContent.message);
    }
    summarizeCount++;
    const summary: FeedbackSummary = {
      ...summaryContent,
      versionNo,
      commentCount: read.length,
      partial: false,
      generatedAt: new Date().toISOString(),
    };
    summaries.set(key, { summary, commentIds });
    return json(200, { summary, outdated: false });
  };

  /** `comment` with what the signed-in user may do with it: authors decide, as on the server. */
  const commentSeen = ({ comment }: StoredComment): Comment => {
    const mine = comment.author.id === signedIn?.id;
    return {
      ...comment,
      permissions: { edit: mine, delete: mine, resolve: mine && comment.parentId === null },
    };
  };

  /** Threads oldest first, without deleted comments or the replies of deleted ones. */
  const listComments = (artifactId: string, query: URLSearchParams): Response => {
    const version = query.get('version');
    const live = comments.filter(
      (c) =>
        c.artifactId === artifactId &&
        !c.deleted &&
        (version === null || c.comment.versionNo === Number(version)),
    );
    const items = live
      .filter((c) => c.comment.parentId === null)
      .map((thread) => ({
        ...commentSeen(thread),
        replies: live.filter((c) => c.comment.parentId === thread.comment.id).map(commentSeen),
      }));
    return json(200, { items });
  };

  const postComment = (artifactId: string, body: Record<string, unknown>): Response => {
    const stored = artifacts.get(artifactId);
    if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
    const parent = comments.find((c) => c.comment.id === body.parentId)?.comment;
    const comment: StoredComment = {
      artifactId,
      comment: {
        id: crypto.randomUUID(),
        versionNo:
          parent?.versionNo ??
          (body.versionNo as number | undefined) ??
          stored.artifact.currentVersion!.versionNo,
        parentId: parent?.id ?? null,
        author: { id: signedIn!.id, displayName: signedIn!.displayName },
        body: String(body.body).trim(),
        resolvedAt: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
      },
      deleted: false,
    };
    comments.push(comment);
    return json(201, { comment: commentSeen(comment) });
  };

  const changeComment = (
    method: string,
    commentId: string,
    body: Record<string, unknown>,
  ): Response => {
    const stored = comments.find((c) => c.comment.id === commentId && !c.deleted);
    if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Comment not found.');
    const { comment } = stored;
    if (comment.author.id !== signedIn?.id) {
      return error(403, ErrorCode.FORBIDDEN, 'Only its author can change this comment.');
    }
    if (method === 'DELETE') {
      stored.deleted = true;
      return json(204);
    }
    if (typeof body.body === 'string' && body.body.trim() !== comment.body) {
      comment.body = body.body.trim();
      comment.editedAt = new Date().toISOString();
    }
    if (typeof body.resolved === 'boolean') {
      comment.resolvedAt = body.resolved ? new Date().toISOString() : null;
    }
    return json(200, { comment: commentSeen(stored) });
  };

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const route = `${init.method ?? 'GET'} ${input}`;

    if (route === 'GET /api/config') {
      return json(200, { maxArtifactBytes, features: { ai: aiEnabled } });
    }
    const interpretMatch = INTERPRET_ROUTE.exec(route);
    if (interpretMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const query = new URLSearchParams(interpretMatch[1]);
      const request = { q: query.get('q') ?? '', scope: query.get('scope') ?? 'mine' };
      interpretRequests.push(request);
      return json(200, interpret(request.q, request.scope));
    }
    const tagsMatch = TAGS_ROUTE.exec(route);
    if (tagsMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      return listTags(new URLSearchParams(tagsMatch[1]));
    }
    const listMatch = LIST_ROUTE.exec(route);
    if (listMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      if (listsHeld) await listsHeld;
      return listArtifacts(new URLSearchParams(listMatch[1]));
    }
    if (route === 'POST /api/artifacts' && init.body instanceof FormData) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      return publish(init.body);
    }

    const searchMatch = USER_SEARCH_ROUTE.exec(route);
    if (searchMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      return searchUsers(new URLSearchParams(searchMatch[1]));
    }
    const accessMatch =
      ACCESS_ROUTE.exec(route) ?? COMPANY_ROUTE.exec(route) ?? PEOPLE_ROUTE.exec(route);
    if (accessMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const artifactId = decodeURIComponent(accessMatch[1] ?? '');
      if (!artifacts.has(artifactId)) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
      if (route.startsWith('PUT')) {
        return changeAccess(artifactId, {
          ...accessOf(artifactId),
          company: {
            enabled: body.enabled,
            pinnedVersionNo: body.enabled ? (body.versionNo ?? null) : null,
          },
        });
      }
      if (route.startsWith('POST')) return sharePeople(artifactId, body);
      return json(200, { access: accessOf(artifactId) });
    }
    const summaryMatch = SUMMARY_ROUTE.exec(route);
    if (summaryMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method, id = '', query = ''] = summaryMatch;
      return feedbackSummary(method!, decodeURIComponent(id), new URLSearchParams(query));
    }
    const commentsMatch = COMMENTS_ROUTE.exec(route);
    if (commentsMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method, id = '', query = ''] = commentsMatch;
      if (method === 'POST' && nextCommentResponse) {
        const response = nextCommentResponse;
        nextCommentResponse = null;
        return response;
      }
      const artifactId = decodeURIComponent(id);
      return method === 'POST'
        ? postComment(artifactId, body)
        : listComments(artifactId, new URLSearchParams(query));
    }
    const commentMatch = COMMENT_ROUTE.exec(route);
    if (commentMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method = '', id = ''] = commentMatch;
      return changeComment(method, decodeURIComponent(id), body ?? {});
    }
    const sharedMatch = SHARED_ROUTE.exec(route);
    if (sharedMatch) {
      return openLink(decodeURIComponent(sharedMatch[1] ?? ''), sharedMatch[2] !== undefined);
    }
    const linkMatch = LINK_ROUTE.exec(route) ?? LINK_RESET_ROUTE.exec(route);
    if (linkMatch) {
      const artifactId = decodeURIComponent(
        (route.startsWith('POST') ? linkMatch[1] : linkMatch[2]) ?? '',
      );
      const current = accessOf(artifactId);
      if (route.startsWith('DELETE')) {
        for (const t of linkTokens) if (t.artifactId === artifactId) t.revoked = true;
        return changeAccess(artifactId, { ...current, link: null });
      }
      if (route.startsWith('POST')) {
        if (!current.link) return error(404, ErrorCode.NOT_FOUND, 'There is no link to reset.');
        const link = newLink(artifactId, current.link.expiresAt, current.link.pinnedVersionNo);
        return changeAccess(artifactId, { ...current, link });
      }
      const expiresAt = body.expiresAt ?? null;
      const versionNo = body.versionNo ?? null;
      const link = current.link
        ? { ...current.link, expiresAt, pinnedVersionNo: versionNo }
        : newLink(artifactId, expiresAt, versionNo);
      return changeAccess(artifactId, { ...current, link });
    }
    const personMatch = PERSON_ROUTE.exec(route);
    if (personMatch) {
      const [, method, id = '', userId = ''] = personMatch;
      const artifactId = decodeURIComponent(id);
      const current = accessOf(artifactId);
      const people =
        method === 'DELETE'
          ? current.people.filter((p) => p.user.id !== userId)
          : current.people.map((p) =>
              p.user.id === userId
                ? {
                    ...p,
                    ...(body.permission ? { permission: body.permission } : {}),
                    ...(body.versionNo === undefined ? {} : { pinnedVersionNo: body.versionNo }),
                  }
                : p,
            );
      return changeAccess(artifactId, { ...current, people });
    }

    const versionsMatch = VERSIONS_ROUTE.exec(route);
    if (versionsMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method, id = ''] = versionsMatch;
      if (method === 'POST' && init.body instanceof FormData) {
        return publishVersion(decodeURIComponent(id), init.body);
      }
      const stored = artifacts.get(decodeURIComponent(id));
      if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
      return json(200, { items: stored.versions.toReversed() });
    }

    const contentMatch = CONTENT_ROUTE.exec(route);
    if (contentMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const stored = artifacts.get(decodeURIComponent(contentMatch[1] ?? ''));
      const content = stored?.content.get(Number(contentMatch[2]));
      if (content === undefined) return error(404, ErrorCode.NOT_FOUND, 'Not found.');
      return new Response(content, { status: 200 });
    }

    const artifactMatch = ARTIFACT_ROUTE.exec(route);
    if (artifactMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method, id = ''] = artifactMatch;
      const stored = artifacts.get(decodeURIComponent(id));
      if (!stored) return error(404, ErrorCode.NOT_FOUND, 'Artifact not found.');
      if (method === 'DELETE') {
        artifacts.delete(stored.artifact.id);
        return json(204);
      }
      if (method === 'PATCH') {
        if (nextUpdateResponse) {
          const response = nextUpdateResponse;
          nextUpdateResponse = null;
          return response;
        }
        stored.artifact = { ...stored.artifact, ...body, updatedAt: new Date().toISOString() };
      }
      return json(200, { artifact: seen(stored.artifact) });
    }

    const uploadMatch = UPLOAD_SESSION_ROUTE.exec(route);
    if (uploadMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const [, method, token = ''] = uploadMatch;
      const upload = uploadSessions.get(decodeURIComponent(token));
      const stored = upload && artifacts.get(upload.artifactId);
      if (!upload || !stored) {
        return error(404, ErrorCode.NOT_FOUND, "This upload link doesn't work.");
      }
      if (method === 'GET') {
        return json(200, {
          session: {
            purpose: stored.artifact.status === 'draft' ? 'create' : 'new_version',
            status: upload.done ? 'done' : upload.expired ? 'expired' : 'open',
            artifact: { id: stored.artifact.id, title: stored.artifact.title },
            versionNo: stored.artifact.latestVersionNo + 1,
            changeNote: upload.changeNote,
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        });
      }
      if (upload.done) return json(201, { artifact: seen(stored.artifact) });
      if (upload.expired) {
        return error(410, ErrorCode.UPLOAD_SESSION_EXPIRED, 'This upload link has expired.');
      }
      const form = new FormData();
      form.set('metadata', JSON.stringify({ changeNote: upload.changeNote ?? '' }));
      form.set('file', (init.body as FormData).get('file') as File);
      const response = publishVersion(upload.artifactId, form);
      if (response.ok) {
        upload.done = true;
        stored.artifact = { ...stored.artifact, status: 'published' };
        return json(201, { artifact: seen(stored.artifact) });
      }
      return response;
    }

    const tokenMatch = TOKEN_ROUTE.exec(route);
    if (tokenMatch) {
      if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      const id = decodeURIComponent(tokenMatch[1] ?? '');
      if (!apiTokens.some((t) => t.id === id)) {
        return error(404, ErrorCode.NOT_FOUND, 'API token not found.');
      }
      apiTokens = apiTokens.filter((t) => t.id !== id);
      return json(204);
    }

    switch (route) {
      case 'GET /api/tokens':
        if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
        return json(200, { items: apiTokens });
      case 'POST /api/tokens': {
        if (!signedIn) return error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
        if (apiTokens.length >= API_TOKENS_MAX) {
          return error(
            409,
            ErrorCode.CONFLICT,
            `You can have at most ${API_TOKENS_MAX} API tokens. Revoke one you no longer use.`,
          );
        }
        const secret = `ah_${crypto.randomUUID().replaceAll('-', '')}`;
        const token: ApiToken = {
          id: crypto.randomUUID(),
          name: body.name.trim(),
          prefix: secret.slice(0, 8),
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
        };
        apiTokens = [token, ...apiTokens];
        return json(201, { token, secret });
      }
      case 'GET /api/auth/me':
        return signedIn
          ? json(200, { user: signedIn })
          : error(401, ErrorCode.UNAUTHENTICATED, 'Please log in.');
      case 'POST /api/auth/login': {
        const account = accounts.get(body.email);
        if (!account || account.password !== body.password) {
          return error(401, ErrorCode.UNAUTHENTICATED, 'Invalid email or password.');
        }
        signedIn = account.user;
        return json(200, { user: signedIn });
      }
      case 'POST /api/auth/signup': {
        if (accounts.has(body.email)) {
          return error(409, ErrorCode.CONFLICT, 'An account with this email already exists.');
        }
        const user: User = {
          id: crypto.randomUUID(),
          email: body.email,
          displayName: body.displayName,
          createdAt: new Date().toISOString(),
        };
        accounts.set(body.email, { user, password: body.password });
        signedIn = user;
        return json(201, { user });
      }
      case 'POST /api/auth/logout':
        signedIn = null;
        return json(204);
      default:
        return error(404, ErrorCode.NOT_FOUND, `No fake for ${route}`);
    }
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    addAccount(email: string, password: string, displayName = 'Ada Lovelace') {
      const user: User = {
        id: crypto.randomUUID(),
        email,
        displayName,
        createdAt: new Date().toISOString(),
      };
      accounts.set(email, { user, password });
      return user;
    },
    publishedForms,
    /** The next publish request fails with this error instead of succeeding. */
    failNextPublish(status: number, code: ErrorCode, message: string, details?: unknown) {
      nextPublishResponse = json(status, {
        error: { code, message, details, requestId: 'test-req' },
      });
    },
    setMaxArtifactBytes(bytes: number) {
      maxArtifactBytes = bytes;
    },
    /** Turns AI on (`features.ai`), answering natural-language searches with `answer`. */
    enableAi(answer: (q: string, scope: string) => SearchInterpretation = keywordSearch) {
      aiEnabled = true;
      interpret = answer;
    },
    interpretRequests,
    /** What summarizing feedback writes from now on; an error makes it fail. */
    summarizeWith(content: FeedbackSummaryContent | Error) {
      summaryContent = content;
    },
    /** How many summaries were written. */
    get summarizeCount() {
      return summarizeCount;
    },
    /** The next PATCH of an artifact fails with this error instead of succeeding. */
    failNextUpdate(status: number, code: ErrorCode, message: string, details?: unknown) {
      nextUpdateResponse = json(status, {
        error: { code, message, details, requestId: 'test-req' },
      });
    },
    /**
     * Serves `artifact` with `versions` (oldest first; by default only its current version),
     * each with `content`.
     */
    addArtifact(
      artifact: Artifact,
      content: BodyInit = '',
      versions: ArtifactVersion[] = artifact.currentVersion ? [artifact.currentVersion] : [],
    ) {
      artifacts.set(artifact.id, {
        artifact,
        versions,
        content: new Map(versions.map((version) => [version.versionNo, content])),
      });
    },
    /**
     * Turns on a link for the artifact, as if its owner had, and returns its token. `expired`
     * makes it one that has expired; `revoked` one that was turned off.
     */
    addLink(artifactId: string, { expired = false, revoked = false } = {}): string {
      const link = newLink(
        artifactId,
        expired ? new Date(Date.now() - 1000).toISOString() : null,
        null,
      );
      const token = link!.url.slice(link!.url.lastIndexOf('/') + 1);
      if (revoked) linkTokens.find((t) => t.token === token)!.revoked = true;
      access.set(artifactId, { ...accessOf(artifactId), link: revoked ? null : link });
      return token;
    },
    /** Holds list responses until the returned function is called. */
    holdLists(): () => void {
      let release!: () => void;
      listsHeld = new Promise((resolve) => {
        release = () => {
          listsHeld = null;
          resolve();
        };
      });
      return release;
    },
    /** Who the artifact is shared with, as the fake server has it. */
    access(artifactId: string): ArtifactAccess {
      return accessOf(artifactId);
    },
    /** Shares the artifact with `user`, as if its owner had. */
    shareWith(artifactId: string, user: User, permission: SharedPerson['permission'] = 'view') {
      const current = accessOf(artifactId);
      access.set(artifactId, {
        ...current,
        people: [
          ...current.people,
          {
            user: { id: user.id, displayName: user.displayName, email: user.email },
            permission,
            pinnedVersionNo: null,
            sharedAt: new Date().toISOString(),
          },
        ],
      });
    },
    /**
     * Adds a comment by `author` on the artifact's current version (or `versionNo`), as a reply
     * to `parentId` if given. Returns its id.
     */
    addComment(
      artifactId: string,
      author: User,
      body: string,
      {
        versionNo,
        parentId = null,
        resolved = false,
      }: { versionNo?: number; parentId?: string | null; resolved?: boolean } = {},
    ): string {
      const parent = comments.find((c) => c.comment.id === parentId)?.comment;
      const comment = {
        id: crypto.randomUUID(),
        versionNo:
          parent?.versionNo ?? versionNo ?? artifacts.get(artifactId)!.artifact.latestVersionNo,
        parentId,
        author: { id: author.id, displayName: author.displayName },
        body,
        resolvedAt: resolved ? new Date().toISOString() : null,
        editedAt: null,
        createdAt: new Date().toISOString(),
      };
      comments.push({ artifactId, comment, deleted: false });
      return comment.id;
    },
    /** Every comment the fake server has that isn't deleted, oldest first. */
    comments(): Omit<Comment, 'permissions'>[] {
      return comments.filter((c) => !c.deleted).map((c) => c.comment);
    },
    /** Deletes a comment behind the app's back, as if from another tab. */
    deleteComment(commentId: string) {
      const stored = comments.find((c) => c.comment.id === commentId);
      if (stored) stored.deleted = true;
    },
    /** The next new comment fails with this error instead of being added. */
    failNextComment(status: number, code: ErrorCode, message: string, details?: unknown) {
      nextCommentResponse = json(status, {
        error: { code, message, details, requestId: 'test-req' },
      });
    },
    /** The artifact as the fake server currently has it, if it still exists. */
    artifact(id: string): Artifact | undefined {
      return artifacts.get(id)?.artifact;
    },
    /**
     * An upload link for the artifact (added with `addArtifact`), as if an MCP client had asked
     * for one. Returns its token.
     */
    addUploadSession(
      artifactId: string,
      {
        changeNote = null,
        expired = false,
      }: { changeNote?: string | null; expired?: boolean } = {},
    ): string {
      const token = crypto.randomUUID();
      uploadSessions.set(token, { artifactId, changeNote, expired, done: false });
      return token;
    },
    /** Gives the signed-in user an API token, as if created earlier. */
    addApiToken(name: string, lastUsedAt: string | null = null): ApiToken {
      const token: ApiToken = {
        id: crypto.randomUUID(),
        name,
        prefix: 'ah_AbCdE',
        lastUsedAt,
        createdAt: new Date().toISOString(),
      };
      apiTokens = [token, ...apiTokens];
      return token;
    },
    /** The signed-in user's live API tokens, as the fake server has them. */
    apiTokens(): ApiToken[] {
      return apiTokens;
    },
    signIn(user: User) {
      signedIn = user;
    },
    /** Simulates the session expiring on the server. */
    expireSession() {
      signedIn = null;
    },
    calls(route: string) {
      return fetchMock.mock.calls.filter(
        ([url, init]) => `${init?.method ?? 'GET'} ${url}` === route,
      ).length;
    },
  };
}
