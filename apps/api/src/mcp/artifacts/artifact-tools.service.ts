import { Injectable } from '@nestjs/common';
import {
  ARTIFACT_LIST_MAX_PAGE,
  ARTIFACT_SEARCH_MAX_LENGTH,
  ARTIFACT_TAG_MAX_LENGTH,
  ARTIFACT_TYPE_FILTERS,
  type ArtifactAccess,
  type ArtifactTypeFilter,
} from '@artifact-hub/shared';
import { z } from 'zod';
import type { ArtifactVersion } from '../../artifacts/artifact-version.entity.js';
import { ArtifactsService } from '../../artifacts/artifacts.service.js';
import type { ArtifactFilters, ArtifactView } from '../../artifacts/artifacts.types.js';
import type { Actor } from '../../auth/auth.types.js';
import { CommentsService } from '../../comments/comments.service.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { SharingService } from '../../sharing/sharing.service.js';
import { artifactPageUrl } from '../app-urls.js';
import { parseArtifactRef } from '../artifact-ref.js';
import { defineTool } from '../define-tool.js';
import { countFeedback } from '../feedback/feedback-counts.js';
import type { McpTool, McpToolProvider, ToolOutput } from '../mcp.types.js';
import { accessData } from '../sharing/access-data.js';
import { typeName } from '../type-names.js';
import { versionNotFound } from '../version-not-found.js';
import type { FeedbackCounts } from '../feedback/feedback.types.js';
import type { FindArtifactsScope } from './artifacts.types.js';

const PAGE_SIZE = 10;
/** Versions listed by `get_artifact`, newest first. */
const VERSIONS_SHOWN = 20;
const DESCRIPTION_PREVIEW_LENGTH = 200;

const SCOPES = ['all', 'mine', 'shared_with_me', 'company'] as const satisfies FindArtifactsScope[];
const TYPES = Object.keys(ARTIFACT_TYPE_FILTERS) as [ArtifactTypeFilter, ...ArtifactTypeFilter[]];

const SCOPE_FILTERS: Record<FindArtifactsScope, (actor: Actor) => ArtifactFilters> = {
  all: () => ({}),
  mine: (actor) => ({ ownerId: actor.userId }),
  shared_with_me: (actor) => ({ sharedWith: actor.userId }),
  company: () => ({ visibility: 'public' }),
};

/** What an empty, unfiltered `find_artifacts` result means in each scope. */
const EMPTY_SCOPE_HINTS: Record<FindArtifactsScope, string> = {
  all: 'Nothing to show yet: the user has no artifacts, and none are shared with them.',
  mine: "The user hasn't published anything yet. Try scope: all for what others shared.",
  shared_with_me: 'Nothing has been shared with the user by name. Try scope: all.',
  company: 'Nothing has been shared with everyone at the company yet. Try scope: all.',
};

/** Finding artifacts and looking at one. */
@Injectable()
export class ArtifactToolsService implements McpToolProvider {
  constructor(
    private readonly artifacts: ArtifactsService,
    private readonly comments: CommentsService,
    private readonly sharing: SharingService,
    @InjectEnv() private readonly env: Env,
  ) {}

  tools(): McpTool[] {
    return [this.findArtifacts(), this.getArtifact()];
  }

  private findArtifacts() {
    return defineTool({
      name: 'find_artifacts',
      title: 'Find artifacts',
      description:
        'Search the artifacts the user can see: mockups, reports, decks, diagrams and docs published by them or shared with them. Use it when the user asks to find, list or look up artifacts ("find the pricing mockup", "what did I publish?", "what has been shared with me?"), or to get an id before calling another tool. Results are the most relevant first when there is a query, otherwise the most recently updated.',
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(ARTIFACT_SEARCH_MAX_LENGTH)
          .optional()
          .describe(
            'A few keywords, e.g. "pricing mockup". Every word must match a word (or the start of one) in the title, tags, description or content, so leave out people\'s names, dates and filler words, and narrow with scope, type and tag instead. Omit to list the most recently updated.',
          ),
        scope: z
          .enum(SCOPES)
          .default('all')
          .describe(
            'Where to look, like the gallery tabs. all: everything the user can see. mine: published by the user. shared_with_me: shared with the user by name. company: shared with everyone at the company.',
          ),
        type: z.enum(TYPES).optional().describe('Only artifacts of this type.'),
        tag: z
          .string()
          .trim()
          .toLowerCase()
          .min(1)
          .max(ARTIFACT_TAG_MAX_LENGTH)
          .optional()
          .describe('Only artifacts with this tag.'),
        page: z
          .number()
          .int()
          .min(1)
          .max(ARTIFACT_LIST_MAX_PAGE)
          .default(1)
          .describe(`Page of ${PAGE_SIZE} results, from 1.`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (actor, { query, scope, type, tag, page }) => {
        const { items, total } = await this.artifacts.list(actor, {
          ...SCOPE_FILTERS[scope](actor),
          search: query || undefined,
          mimeTypes: type ? ARTIFACT_TYPE_FILTERS[type] : undefined,
          tag,
          page,
          pageSize: PAGE_SIZE,
        });
        return this.foundArtifacts(items, {
          total,
          page,
          scope,
          filtered: Boolean(query || type || tag),
        });
      },
    });
  }

  private getArtifact() {
    return defineTool({
      name: 'get_artifact',
      title: 'Get an artifact',
      description:
        'Show one artifact: its details, versions, who can see it, and how much feedback it has. Use it when the user asks about a specific artifact ("what\'s the status of the onboarding mockup?", "who can see it?", "what changed in v3?"), after find_artifacts, or to confirm an upload. For the comments themselves, use get_feedback.',
      inputSchema: {
        artifact: z
          .string()
          .describe("The artifact's id, or its page URL (…/artifacts/<id>, optionally ?v=N)."),
        version: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('A version number to show; the newest the user can see by default.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async (actor, input) => {
        const ref = parseArtifactRef(input.artifact);
        const view = await this.artifacts.get(actor, ref.id);
        const [versions, threads, access] = await Promise.all([
          this.artifacts.listVersions(actor, ref.id),
          this.comments.list(actor, ref.id, { include: 'all' }),
          view.permissions.share ? this.sharing.getAccess(actor, ref.id) : null,
        ]);
        const versionNo = input.version ?? ref.versionNo ?? view.currentVersion?.versionNo;
        let version: ArtifactVersion | null = null;
        if (versionNo !== undefined) {
          version = versions.find((v) => v.versionNo === versionNo) ?? null;
          if (!version)
            throw versionNotFound(
              versionNo,
              versions.map((v) => v.versionNo),
            );
        }
        return this.artifactDetails(view, {
          version,
          versions,
          counts: countFeedback(threads),
          access,
        });
      },
    });
  }

  private foundArtifacts(
    items: ArtifactView[],
    {
      total,
      page,
      scope,
      filtered,
    }: { total: number; page: number; scope: FindArtifactsScope; filtered: boolean },
  ): ToolOutput {
    const hasMore = page * PAGE_SIZE < total;
    return {
      total,
      page,
      page_size: PAGE_SIZE,
      has_more: hasMore,
      items: items.map(({ artifact, currentVersion }) => ({
        id: artifact.id,
        title: artifact.title,
        description:
          artifact.description.length > DESCRIPTION_PREVIEW_LENGTH
            ? `${artifact.description.slice(0, DESCRIPTION_PREVIEW_LENGTH)}…`
            : artifact.description,
        type: currentVersion ? typeName(currentVersion.mimeType) : null,
        tags: artifact.tags,
        owner: artifact.owner.displayName,
        version: currentVersion?.versionNo ?? null,
        updated_at: artifact.updatedAt.toISOString(),
        url: artifactPageUrl(this.env.APP_BASE_URL, artifact.id),
      })),
      next_actions:
        total === 0
          ? [
              filtered
                ? `Try fewer or different keywords, or drop the type and tag filters${scope === 'all' ? '' : ', or use scope: all'}.`
                : EMPTY_SCOPE_HINTS[scope],
            ]
          : [
              'Call get_artifact with an id for versions, access and feedback counts.',
              'Call get_feedback with an id to read the comments.',
              ...(hasMore ? [`Call find_artifacts with page: ${page + 1} for more.`] : []),
            ],
    };
  }

  private artifactDetails(
    view: ArtifactView,
    details: {
      version: ArtifactVersion | null;
      versions: ArtifactVersion[];
      counts: FeedbackCounts;
      access: ArtifactAccess | null;
    },
  ): ToolOutput {
    const { artifact, permissions } = view;
    const { version, versions, counts, access } = details;
    const base = this.env.APP_BASE_URL;
    return {
      id: artifact.id,
      title: artifact.title,
      description: artifact.description,
      tags: artifact.tags,
      owner: artifact.owner.displayName,
      status: artifact.status,
      url: artifactPageUrl(base, artifact.id),
      created_at: artifact.createdAt.toISOString(),
      updated_at: artifact.updatedAt.toISOString(),
      your_permissions: [
        'view',
        ...Object.entries(permissions)
          .filter(([, can]) => can)
          .map(([what]) => what),
      ],
      latest_version: view.latestVersionNo,
      version: version && {
        number: version.versionNo,
        type: typeName(version.mimeType),
        size_bytes: version.sizeBytes,
        filename: version.originalFilename,
        change_note: version.changeNote,
        created_at: version.createdAt.toISOString(),
        url: artifactPageUrl(base, artifact.id, version.versionNo),
      },
      versions: versions.slice(0, VERSIONS_SHOWN).map((v) => ({
        number: v.versionNo,
        created_at: v.createdAt.toISOString(),
        change_note: v.changeNote,
      })),
      feedback: {
        open: counts.open,
        resolved: counts.resolved,
        by_version: counts.byVersion.map(({ versionNo, open, resolved }) => ({
          version: versionNo,
          open,
          resolved,
        })),
      },
      // Owner only.
      access: access && accessData(access, { linkUrl: false }),
      next_actions: [
        ...(artifact.status === 'draft'
          ? [
              'It is a draft waiting for its file. If its upload link has expired, call update_artifact with request_upload: true for a new one.',
            ]
          : []),
        ...(counts.open + counts.resolved > 0 ? ['Call get_feedback to read the comments.'] : []),
        ...(versions.length > 1 && version
          ? ['Call get_artifact with another version number to see that version.']
          : []),
      ],
    };
  }
}
