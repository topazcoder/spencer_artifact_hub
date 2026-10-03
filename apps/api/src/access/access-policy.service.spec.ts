import { type ArtifactStatus, type ArtifactVisibility, ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import { Brackets, type SelectQueryBuilder, type WhereExpressionBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AccessPolicyService } from './access-policy.service.js';
import type { AccessAction, AccessTarget } from './access.types.js';

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
    ...overrides,
  };
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

interface Row {
  role: 'owner' | 'other';
  visibility: ArtifactVisibility;
  status: ArtifactStatus;
  deleted: boolean;
  expected: Record<AccessAction, Outcome>;
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

/** Plan §4, every combination of role × visibility × status × deleted. */
const MATRIX: Row[] = [
  { role: 'owner', visibility: 'private', status: 'published', deleted: false, expected: ALL },
  { role: 'owner', visibility: 'public', status: 'published', deleted: false, expected: ALL },
  { role: 'owner', visibility: 'private', status: 'draft', deleted: false, expected: ALL },
  { role: 'owner', visibility: 'public', status: 'draft', deleted: false, expected: ALL },
  { role: 'owner', visibility: 'private', status: 'published', deleted: true, expected: NONE },
  { role: 'owner', visibility: 'public', status: 'published', deleted: true, expected: NONE },
  { role: 'owner', visibility: 'private', status: 'draft', deleted: true, expected: NONE },
  { role: 'owner', visibility: 'public', status: 'draft', deleted: true, expected: NONE },
  { role: 'other', visibility: 'private', status: 'published', deleted: false, expected: NONE },
  {
    role: 'other',
    visibility: 'public',
    status: 'published',
    deleted: false,
    expected: VIEW_AND_COMMENT,
  },
  { role: 'other', visibility: 'private', status: 'draft', deleted: false, expected: NONE },
  { role: 'other', visibility: 'public', status: 'draft', deleted: false, expected: NONE },
  { role: 'other', visibility: 'private', status: 'published', deleted: true, expected: NONE },
  { role: 'other', visibility: 'public', status: 'published', deleted: true, expected: NONE },
  { role: 'other', visibility: 'private', status: 'draft', deleted: true, expected: NONE },
  { role: 'other', visibility: 'public', status: 'draft', deleted: true, expected: NONE },
];

const CASES = MATRIX.flatMap((row) =>
  VIA.flatMap((via) =>
    ACTIONS.map((action) => ({ ...row, via, action, result: row.expected[action] })),
  ),
);

describe('AccessPolicyService', () => {
  it.each(CASES)(
    '$role, $visibility $status artifact (deleted: $deleted), via $via: $action → $result',
    ({ role, visibility, status, deleted, via, action, result }) => {
      const who = actor(role === 'owner' ? OWNER_ID : OTHER_ID, via);
      const target = artifact({ visibility, status, deletedAt: deleted ? new Date() : null });

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

    const logged = vi.mocked(logger.debug).mock.calls;
    expect(logged.map(([fields]) => (fields as { reason: string }).reason)).toEqual([
      'owner_only',
      'private',
      'draft',
      'deleted',
    ]);
    expect(logged[0]).toEqual([
      { userId: OTHER_ID, artifactId: ARTIFACT_ID, action: 'edit', reason: 'owner_only' },
      'Access denied',
    ]);
  });

  it('restricts list queries to live artifacts the actor owns or that are public', () => {
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
    expect(where.orWhere).toHaveBeenCalledWith(
      "(artifact.visibility = 'public' AND artifact.status = 'published')",
    );
  });
});
