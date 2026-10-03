import { type ArtifactStatus, type ArtifactVisibility, ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import { Brackets, type SelectQueryBuilder, type WhereExpressionBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AccessPolicyService } from './access-policy.service.js';
import type { AccessAction, AccessGrant, AccessTarget } from './access.types.js';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const ARTIFACT_ID = '00000000-0000-4000-8000-0000000000aa';
const ACTIONS: AccessAction[] = ['view', 'comment', 'edit', 'share', 'delete'];
const VIA: Actor['via'][] = ['web', 'mcp'];

const logger = { debug: vi.fn() } as unknown as PinoLogger;
const policy = new AccessPolicyService(logger);

function actor(userId: string, via: Actor['via'] = 'web'): Actor {
  return { userId, via };
}

function artifact(overrides: Partial<AccessTarget> = {}): AccessTarget {
  return {
    id: ARTIFACT_ID,
    ownerId: OWNER_ID,
    visibility: 'private',
    status: 'published',
    deletedAt: null,
    publicPinnedVersionId: null,
    grants: [],
    ...overrides,
  };
}

function grant(
  permission: AccessGrant['permission'],
  pinnedVersionId: string | null = null,
): AccessGrant {
  return { permission, pinnedVersionId };
}

/** A private artifact shared with the actor through `grants`. */
function shared(...grants: AccessGrant[]): AccessTarget {
  return artifact({ grants });
}

type Role = 'owner' | 'other' | 'view share' | 'comment share';

/** The actor for `role`, and the grants their shares give them. */
function roleOf(role: Role, via: Actor['via']): { who: Actor; grants: AccessGrant[] } {
  switch (role) {
    case 'owner':
      return { who: actor(OWNER_ID, via), grants: [] };
    case 'other':
      return { who: actor(OTHER_ID, via), grants: [] };
    case 'view share':
      return { who: actor(OTHER_ID, via), grants: [grant('view')] };
    case 'comment share':
      return { who: actor(OTHER_ID, via), grants: [grant('comment'), grant('view')] };
  }
}

/** What `assertCan` does: nothing, or throw with this code. */
type Outcome = 'allowed' | typeof ErrorCode.NOT_FOUND | typeof ErrorCode.FORBIDDEN;

function outcome(who: Actor, action: AccessAction, target: AccessTarget): Outcome {
  try {
    policy.assertCan(who, action, target);
    return 'allowed';
  } catch (error) {
    return (error as { code: Outcome }).code;
  }
}

const ALL: Record<AccessAction, Outcome> = {
  view: 'allowed',
  comment: 'allowed',
  edit: 'allowed',
  share: 'allowed',
  delete: 'allowed',
};
const NONE: Record<AccessAction, Outcome> = {
  view: ErrorCode.NOT_FOUND,
  comment: ErrorCode.NOT_FOUND,
  edit: ErrorCode.NOT_FOUND,
  share: ErrorCode.NOT_FOUND,
  delete: ErrorCode.NOT_FOUND,
};
const VIEW_AND_COMMENT: Record<AccessAction, Outcome> = {
  view: 'allowed',
  comment: 'allowed',
  edit: ErrorCode.FORBIDDEN,
  share: ErrorCode.FORBIDDEN,
  delete: ErrorCode.FORBIDDEN,
};
const VIEW_ONLY: Record<AccessAction, Outcome> = {
  ...VIEW_AND_COMMENT,
  comment: ErrorCode.FORBIDDEN,
};

const ROLES: Role[] = ['owner', 'other', 'view share', 'comment share'];

/**
 * Plan §4: what each role may do with a live, published artifact. Drafts are the owner's only,
 * and deleted artifacts nobody's, whatever the role.
 */
const LIVE: Record<Role, Record<ArtifactVisibility, Record<AccessAction, Outcome>>> = {
  owner: { private: ALL, public: ALL },
  other: { private: NONE, public: VIEW_AND_COMMENT },
  'view share': { private: VIEW_ONLY, public: VIEW_AND_COMMENT },
  'comment share': { private: VIEW_AND_COMMENT, public: VIEW_AND_COMMENT },
};

interface Row {
  role: Role;
  visibility: ArtifactVisibility;
  status: ArtifactStatus;
  deleted: boolean;
  expected: Record<AccessAction, Outcome>;
}

/** Every combination of role × visibility × status × deleted. */
const MATRIX: Row[] = ROLES.flatMap((role) =>
  (['private', 'public'] as const).flatMap((visibility) =>
    (['published', 'draft'] as const).flatMap((status) =>
      [false, true].map((deleted) => ({
        role,
        visibility,
        status,
        deleted,
        expected:
          deleted || (role !== 'owner' && status === 'draft') ? NONE : LIVE[role][visibility],
      })),
    ),
  ),
);

const CASES = MATRIX.flatMap((row) =>
  VIA.flatMap((via) =>
    ACTIONS.map((action) => ({ ...row, via, action, result: row.expected[action] })),
  ),
);

describe('AccessPolicyService', () => {
  it.each(CASES)(
    '$role, $visibility $status artifact (deleted: $deleted), via $via: $action → $result',
    ({ role, visibility, status, deleted, via, action, result }) => {
      const { who, grants } = roleOf(role, via);
      const target = artifact({
        visibility,
        status,
        deletedAt: deleted ? new Date() : null,
        grants,
      });

      expect(outcome(who, action, target)).toBe(result);
      expect(policy.can(who, action, target)).toBe(result === 'allowed');
    },
  );

  it('gives the same message for denied and missing artifacts', () => {
    expect(() => policy.assertCan(actor(OTHER_ID), 'view', artifact())).toThrow(
      'Artifact not found.',
    );
  });

  it('logs denials at debug with ids and the reason only', () => {
    vi.mocked(logger.debug).mockClear();
    outcome(actor(OTHER_ID), 'edit', artifact({ visibility: 'public' }));
    outcome(actor(OTHER_ID), 'view', artifact());
    outcome(actor(OTHER_ID), 'view', artifact({ visibility: 'public', status: 'draft' }));
    outcome(actor(OWNER_ID), 'view', artifact({ deletedAt: new Date() }));
    outcome(actor(OTHER_ID), 'comment', artifact({ grants: [grant('view')] }));

    const logged = vi.mocked(logger.debug).mock.calls;
    expect(logged.map(([fields]) => (fields as { reason: string }).reason)).toEqual([
      'owner_only',
      'private',
      'draft',
      'deleted',
      'view_only',
    ]);
    expect(logged[0]).toEqual([
      { userId: OTHER_ID, artifactId: ARTIFACT_ID, action: 'edit', reason: 'owner_only' },
      'Access denied',
    ]);
  });

  it('sums up permissions for clients', () => {
    expect(policy.permissions(actor(OWNER_ID), artifact())).toEqual({
      comment: true,
      edit: true,
      share: true,
      delete: true,
    });
    expect(policy.permissions(actor(OTHER_ID), artifact({ grants: [grant('view')] }))).toEqual({
      comment: false,
      edit: false,
      share: false,
      delete: false,
    });
  });

  describe('visibleVersionIds', () => {
    it('shows every version to the owner, pinned or not', () => {
      expect(policy.visibleVersionIds(actor(OWNER_ID), artifact())).toBeNull();
      const pinned = artifact({ visibility: 'public', publicPinnedVersionId: 'v1' });
      expect(policy.visibleVersionIds(actor(OWNER_ID), pinned)).toBeNull();
    });

    it('shows the company the latest version, or only the pinned one', () => {
      const latest = artifact({ visibility: 'public' });
      expect(policy.visibleVersionIds(actor(OTHER_ID), latest)).toBeNull();
      const pinned = artifact({ visibility: 'public', publicPinnedVersionId: 'v1' });
      expect(policy.visibleVersionIds(actor(OTHER_ID), pinned)).toEqual(new Set(['v1']));
    });

    it('combines a pinned company version with the actor’s own shares', () => {
      const pinnedPublic = { visibility: 'public', publicPinnedVersionId: 'v1' } as const;
      const withLatest = artifact({ ...pinnedPublic, grants: [grant('view')] });
      expect(policy.visibleVersionIds(actor(OTHER_ID), withLatest)).toBeNull();
      const withPinned = artifact({ ...pinnedPublic, grants: [grant('view', 'v3')] });
      expect(policy.visibleVersionIds(actor(OTHER_ID), withPinned)).toEqual(new Set(['v1', 'v3']));
    });

    it('ignores the company pin while the artifact is private', () => {
      const unshared = artifact({ publicPinnedVersionId: 'v1', grants: [grant('view')] });
      expect(policy.visibleVersionIds(actor(OTHER_ID), unshared)).toBeNull();
    });

    it('shows every version through an unpinned share, even next to pinned ones', () => {
      expect(policy.visibleVersionIds(actor(OTHER_ID), shared(grant('view')))).toBeNull();
      const mixed = shared(grant('comment', 'v1'), grant('view'));
      expect(policy.visibleVersionIds(actor(OTHER_ID), mixed)).toBeNull();
    });

    it('shows only the pinned versions when every share is pinned', () => {
      const pinned = shared(grant('view', 'v1'), grant('view', 'v3'));
      expect(policy.visibleVersionIds(actor(OTHER_ID), pinned)).toEqual(new Set(['v1', 'v3']));
    });

    it('shows nothing without access', () => {
      expect(policy.visibleVersionIds(actor(OTHER_ID), artifact())).toEqual(new Set());
      const deleted = artifact({ deletedAt: new Date(), grants: [grant('view')] });
      expect(policy.visibleVersionIds(actor(OTHER_ID), deleted)).toEqual(new Set());
    });
  });

  it('restricts list queries to live artifacts the actor owns, public ones and shared ones', () => {
    const qb = { andWhere: vi.fn().mockReturnThis() };
    policy.restrictToViewable(
      qb as unknown as SelectQueryBuilder<AccessTarget>,
      'artifact',
      actor(OWNER_ID),
    );

    const [[deleted], [visible]] = qb.andWhere.mock.calls as [[string], [Brackets]];
    expect(deleted).toBe('artifact.deletedAt IS NULL');
    expect(visible).toBeInstanceOf(Brackets);

    const where = { where: vi.fn().mockReturnThis(), orWhere: vi.fn().mockReturnThis() };
    visible.whereFactory(where as unknown as WhereExpressionBuilder);
    expect(where.where).toHaveBeenCalledWith('artifact.ownerId = :accessViewerId', {
      accessViewerId: OWNER_ID,
    });
    const [[isPublic], [isShared]] = where.orWhere.mock.calls as [[string], [string]];
    expect(isPublic).toBe("(artifact.visibility = 'public' AND artifact.status = 'published')");
    expect(isShared).toContain("artifact.status = 'published' AND EXISTS");
    expect(isShared).toContain(
      'share.artifact_id = artifact.id AND share.user_id = :accessViewerId',
    );
  });
});
