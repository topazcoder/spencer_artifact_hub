import { z } from 'zod';

/** `comment` includes `view`. */
export const SHARE_PERMISSIONS = ['view', 'comment'] as const;
export const sharePermissionSchema = z.enum(SHARE_PERMISSIONS);
export type SharePermission = z.infer<typeof sharePermissionSchema>;

/** The version an access level shows: a version number, or null for always the latest. */
const versionChoiceSchema = z.number().int().positive().nullable();

export const SHARE_PEOPLE_MAX = 20;

/** A colleague with access, as the artifact's owner sees them. */
export const sharedPersonSchema = z.object({
  user: z.object({ id: z.uuid(), displayName: z.string(), email: z.string() }),
  permission: sharePermissionSchema,
  /** The only version they see through this share; null = always the latest. */
  pinnedVersionNo: z.number().int().positive().nullable(),
  sharedAt: z.iso.datetime(),
});

export type SharedPerson = z.infer<typeof sharedPersonSchema>;

/** Who has access to an artifact besides its owner. Owner only. */
export const artifactAccessSchema = z.object({
  /** Everyone at the company (signed in) can view and comment. */
  company: z.object({
    enabled: z.boolean(),
    pinnedVersionNo: z.number().int().positive().nullable(),
  }),
  /** In the order they were added. */
  people: z.array(sharedPersonSchema),
});

export type ArtifactAccess = z.infer<typeof artifactAccessSchema>;

/** Response of `GET /api/artifacts/:id/access` and of every change to it. */
export const artifactAccessResponseSchema = z.object({ access: artifactAccessSchema });

export type ArtifactAccessResponse = z.infer<typeof artifactAccessResponseSchema>;

/** Body of `PUT /api/artifacts/:id/access/company`. */
export const setCompanyAccessRequestSchema = z.object({
  enabled: z.boolean(),
  versionNo: versionChoiceSchema.default(null),
});

export type SetCompanyAccessRequest = z.input<typeof setCompanyAccessRequestSchema>;
export type SetCompanyAccessOptions = z.output<typeof setCompanyAccessRequestSchema>;

/**
 * Body of `POST /api/artifacts/:id/access/people`. People who already have access get the new
 * permission and version.
 */
export const sharePeopleRequestSchema = z.object({
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email('Enter valid email addresses.')))
    .min(1, 'Add at least one email.')
    .max(SHARE_PEOPLE_MAX, `Share with at most ${SHARE_PEOPLE_MAX} people at once.`)
    .transform((emails) => [...new Set(emails)]),
  permission: sharePermissionSchema,
  versionNo: versionChoiceSchema.default(null),
});

export type SharePeopleRequest = z.input<typeof sharePeopleRequestSchema>;
export type SharePeopleOptions = z.output<typeof sharePeopleRequestSchema>;

/** `details` of a `SHARE_RECIPIENT_UNKNOWN` error. */
export const unknownRecipientsDetailsSchema = z.object({ unknownEmails: z.array(z.string()) });

export type UnknownRecipientsDetails = z.infer<typeof unknownRecipientsDetailsSchema>;

/** Body of `PATCH /api/artifacts/:id/access/people/:userId`. */
export const updatePersonAccessRequestSchema = z
  .strictObject({ permission: sharePermissionSchema, versionNo: versionChoiceSchema })
  .partial()
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: 'Send at least one field to change.',
  });

export type UpdatePersonAccessRequest = z.input<typeof updatePersonAccessRequestSchema>;
export type UpdatePersonAccessOptions = z.output<typeof updatePersonAccessRequestSchema>;

export const USER_SEARCH_MIN_LENGTH = 3;

/** Query of `GET /api/users/search`, for picking people to share with. */
export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(USER_SEARCH_MIN_LENGTH, `Type at least ${USER_SEARCH_MIN_LENGTH} characters.`)
    .max(100),
});

export type UserSearchQuery = z.output<typeof userSearchQuerySchema>;

/** At most a few users whose email or name starts with the query, never the caller. */
export const userSearchResponseSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), displayName: z.string(), email: z.string() })),
});

export type UserSearchResponse = z.infer<typeof userSearchResponseSchema>;
export type UserSummary = UserSearchResponse['items'][number];
