import { z } from 'zod';

/** Text formats: accepted as UTF-8, and the only formats MCP clients may send inline. */
export const TEXT_FORMAT_MIME_TYPES = {
  html: 'text/html',
  svg: 'image/svg+xml',
  markdown: 'text/markdown',
} as const;

export type TextFormat = keyof typeof TEXT_FORMAT_MIME_TYPES;

/** Binary formats: identified by their magic bytes only. */
export const BINARY_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

/** Every content type an artifact version can have. The server decides it, never the client. */
export const ARTIFACT_MIME_TYPES = [
  ...Object.values(TEXT_FORMAT_MIME_TYPES),
  ...BINARY_MIME_TYPES,
] as const;

export const artifactMimeTypeSchema = z.enum(ARTIFACT_MIME_TYPES);

export type ArtifactMimeType = z.infer<typeof artifactMimeTypeSchema>;

/** `public` = everyone at the company (signed in) can view and comment. */
export const ARTIFACT_VISIBILITIES = ['private', 'public'] as const;
export const artifactVisibilitySchema = z.enum(ARTIFACT_VISIBILITIES);
export type ArtifactVisibility = z.infer<typeof artifactVisibilitySchema>;

/** `draft` = created by MCP and still waiting for its first upload. */
export const ARTIFACT_STATUSES = ['draft', 'published'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];

/** Who wrote the title, description and tags: the owner, the AI enrichment job, or both. */
export const METADATA_SOURCES = ['user', 'ai', 'mixed'] as const;
export type MetadataSource = (typeof METADATA_SOURCES)[number];

export const ARTIFACT_TITLE_MAX_LENGTH = 120;
export const ARTIFACT_DESCRIPTION_MAX_LENGTH = 2000;
export const ARTIFACT_TAGS_MAX = 10;
export const ARTIFACT_TAG_MAX_LENGTH = 32;

/** Tags are stored normalized: trimmed, lowercase, inner whitespace collapsed. */
export const artifactTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((tag) => tag.replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Tags cannot be empty.')
      .max(ARTIFACT_TAG_MAX_LENGTH, `Keep tags to ${ARTIFACT_TAG_MAX_LENGTH} characters.`)
      .regex(/^[^,\p{C}]+$/u, 'Tags cannot contain commas or control characters.'),
  );

export const artifactTagsSchema = z
  .array(artifactTagSchema)
  .max(ARTIFACT_TAGS_MAX, `Use at most ${ARTIFACT_TAGS_MAX} tags.`)
  .transform((tags) => [...new Set(tags)]);

const artifactTitleSchema = z
  .string()
  .trim()
  .min(1, 'Enter a title.')
  .max(ARTIFACT_TITLE_MAX_LENGTH, `Keep the title to ${ARTIFACT_TITLE_MAX_LENGTH} characters.`);

const artifactDescriptionSchema = z
  .string()
  .trim()
  .max(
    ARTIFACT_DESCRIPTION_MAX_LENGTH,
    `Keep the description to ${ARTIFACT_DESCRIPTION_MAX_LENGTH} characters.`,
  );

/** Metadata sent with a new artifact (the `metadata` part of the multipart upload). */
export const createArtifactRequestSchema = z.object({
  title: artifactTitleSchema,
  description: artifactDescriptionSchema.default(''),
  tags: artifactTagsSchema.default([]),
  visibility: artifactVisibilitySchema.default('private'),
});

export type CreateArtifactRequest = z.input<typeof createArtifactRequestSchema>;
export type CreateArtifactMetadata = z.output<typeof createArtifactRequestSchema>;

/**
 * Body of `PATCH /api/artifacts/:id`: only the fields to change. Never creates a version.
 * Access (including visibility) is changed through `/api/artifacts/:id/access`.
 */
export const updateArtifactRequestSchema = z
  .strictObject({
    title: artifactTitleSchema,
    description: artifactDescriptionSchema,
    tags: artifactTagsSchema,
  })
  .partial()
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'Send at least one field to change.',
  });

export type UpdateArtifactRequest = z.input<typeof updateArtifactRequestSchema>;
export type UpdateArtifactMetadata = z.output<typeof updateArtifactRequestSchema>;

export const VERSION_CHANGE_NOTE_MAX_LENGTH = 500;

/** Details sent with a new version (the `metadata` part of the multipart upload). */
export const createVersionRequestSchema = z.object({
  /** What changed. Blank means none. */
  changeNote: z
    .string()
    .trim()
    .max(
      VERSION_CHANGE_NOTE_MAX_LENGTH,
      `Keep the change note to ${VERSION_CHANGE_NOTE_MAX_LENGTH} characters.`,
    )
    .default(''),
});

export type CreateVersionRequest = z.input<typeof createVersionRequestSchema>;
export type CreateVersionMetadata = z.output<typeof createVersionRequestSchema>;

export const artifactVersionSchema = z.object({
  id: z.uuid(),
  versionNo: z.number().int().positive(),
  mimeType: artifactMimeTypeSchema,
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string(),
  originalFilename: z.string().nullable(),
  changeNote: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type ArtifactVersion = z.infer<typeof artifactVersionSchema>;

export const artifactSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  visibility: artifactVisibilitySchema,
  status: z.enum(ARTIFACT_STATUSES),
  metadataSource: z.enum(METADATA_SOURCES),
  owner: z.object({ id: z.uuid(), displayName: z.string() }),
  /**
   * The newest version the requesting user may see (the latest, unless a share limits them to
   * one). Null only for drafts.
   */
  currentVersion: artifactVersionSchema.nullable(),
  /** For viewers limited to one version by a share, that version's number. */
  latestVersionNo: z.number().int().nonnegative(),
  /** What the requesting user may do; the server enforces it either way. */
  permissions: z.object({
    comment: z.boolean(),
    edit: z.boolean(),
    share: z.boolean(),
    delete: z.boolean(),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type ArtifactPermissions = Artifact['permissions'];

/** Response of `POST /api/artifacts` and `GET /api/artifacts/:id`. */
export const artifactResponseSchema = z.object({ artifact: artifactSchema });

export type ArtifactResponse = z.infer<typeof artifactResponseSchema>;

/** Response of `GET /api/artifacts/:id/versions`: every version, newest first. */
export const artifactVersionListResponseSchema = z.object({
  items: z.array(artifactVersionSchema),
});

export type ArtifactVersionListResponse = z.infer<typeof artifactVersionListResponseSchema>;

export const ARTIFACT_LIST_DEFAULT_PAGE_SIZE = 24;
export const ARTIFACT_LIST_MAX_PAGE_SIZE = 50;
/** Caps the OFFSET a client can make the database skip. */
export const ARTIFACT_LIST_MAX_PAGE = 1000;

/**
 * `mine`: published by me. `shared`: shared with me by name. `public`: shared with everyone at
 * the company, mine included.
 */
export const ARTIFACT_LIST_SCOPES = ['mine', 'shared', 'public'] as const;
export type ArtifactListScope = (typeof ARTIFACT_LIST_SCOPES)[number];

/** Gallery type filters, each standing for one or more content types. */
export const ARTIFACT_TYPE_FILTERS = {
  html: ['text/html'],
  image: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  pdf: ['application/pdf'],
  markdown: ['text/markdown'],
  svg: ['image/svg+xml'],
} as const satisfies Record<string, readonly ArtifactMimeType[]>;

export type ArtifactTypeFilter = keyof typeof ARTIFACT_TYPE_FILTERS;

export const ARTIFACT_SEARCH_MAX_LENGTH = 200;

/** Blank values count as absent, so a cleared filter in a URL (`?q=`) is no filter. */
export const blankAsUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

/** Query of `GET /api/artifacts`. Filters narrow the scope; `q` also ranks by relevance. */
export const artifactListQuerySchema = z.object({
  scope: z.enum(ARTIFACT_LIST_SCOPES).default('mine'),
  /** Words to find in the title, tags, description and content; each may be a word's start. */
  q: z.preprocess(
    blankAsUndefined,
    z
      .string()
      .trim()
      .max(
        ARTIFACT_SEARCH_MAX_LENGTH,
        `Keep the search to ${ARTIFACT_SEARCH_MAX_LENGTH} characters.`,
      )
      .optional(),
  ),
  type: z.preprocess(
    blankAsUndefined,
    z.enum(Object.keys(ARTIFACT_TYPE_FILTERS) as [ArtifactTypeFilter]).optional(),
  ),
  tag: z.preprocess(blankAsUndefined, artifactTagSchema.optional()),
  /** 1-based. */
  page: z.coerce.number().int().min(1).max(ARTIFACT_LIST_MAX_PAGE).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(ARTIFACT_LIST_MAX_PAGE_SIZE)
    .default(ARTIFACT_LIST_DEFAULT_PAGE_SIZE),
});

export type ArtifactListQuery = z.output<typeof artifactListQuerySchema>;

/** Query of `GET /api/artifacts/tags`: the tags used in a gallery scope. */
export const artifactTagListQuerySchema = artifactListQuerySchema.pick({ scope: true });

export type ArtifactTagListQuery = z.output<typeof artifactTagListQuerySchema>;

/** The most used tags first, at most `ARTIFACT_TAG_LIST_MAX`. */
export const artifactTagListResponseSchema = z.object({
  items: z.array(z.object({ tag: z.string(), count: z.number().int().positive() })),
});

export type ArtifactTagListResponse = z.infer<typeof artifactTagListResponseSchema>;

export const ARTIFACT_TAG_LIST_MAX = 50;

/** Newest first (by last update), or most relevant first when searching. A page past the end has no items. */
export const artifactListResponseSchema = z.object({
  items: z.array(artifactSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  /** Matching artifacts across all pages. */
  total: z.number().int().nonnegative(),
});

export type ArtifactListResponse = z.infer<typeof artifactListResponseSchema>;
