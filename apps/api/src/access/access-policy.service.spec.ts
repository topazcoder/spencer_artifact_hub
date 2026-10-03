import { ErrorCode } from '@artifact-hub/shared';
import type { PinoLogger } from 'nestjs-pino';
import type { SelectQueryBuilder } from 'typeorm';
import type { Actor } from '../auth/auth.types.js';
import { AccessPolicyService } from './access-policy.service.js';
import type { AccessAction, AccessTarget } from './access.types.js';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_ID = '00000000-0000-4000-8000-000000000002';
const ACTIONS: AccessAction[] = ['view', 'comment', 'edit', 'share', 'delete'];

const logger = { debug: vi.fn() } as unknown as PinoLogger;
const policy = new AccessPolicyService(logger);

function actor(userId: string, via: Actor['via'] = 'web'): Actor {
  return { userId, via };
}

function artifact(overrides: Partial<AccessTarget> = {}): AccessTarget {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    ownerId: OWNER_ID,
    visibility: 'private',
    deletedAt: null,
    ...overrides,
  };
}

describe('AccessPolicyService (owner-only)', () => {
  it.each(ACTIONS)('lets the owner %s, from the web and from MCP', (action) => {
    expect(policy.can(actor(OWNER_ID), action, artifact())).toBe(true);
    expect(policy.can(actor(OWNER_ID, 'mcp'), action, artifact())).toBe(true);
    expect(() => policy.assertCan(actor(OWNER_ID), action, artifact())).not.toThrow();
  });

  it.each(ACTIONS)('denies %s to anyone else with NOT_FOUND', (action) => {
    expect(policy.can(actor(OTHER_ID), action, artifact())).toBe(false);
    expect(() => policy.assertCan(actor(OTHER_ID), action, artifact())).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });

  it('does not open public artifacts to others yet (step 12)', () => {
    expect(policy.can(actor(OTHER_ID), 'view', artifact({ visibility: 'public' }))).toBe(false);
  });

  it.each(ACTIONS)('denies %s on a deleted artifact, even to its owner', (action) => {
    const deleted = artifact({ deletedAt: new Date() });
    expect(policy.can(actor(OWNER_ID), action, deleted)).toBe(false);
    expect(() => policy.assertCan(actor(OWNER_ID), action, deleted)).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
  });

  it('gives the same message for denied and missing artifacts', () => {
    expect(() => policy.assertCan(actor(OTHER_ID), 'view', artifact())).toThrow(
      'Artifact not found.',
    );
  });

  it('restricts list queries to non-deleted artifacts the actor owns', () => {
    const qb = { andWhere: vi.fn().mockReturnThis() };
    policy.restrictToViewable(
      qb as unknown as SelectQueryBuilder<AccessTarget>,
      'artifact',
      actor(OWNER_ID),
    );
    expect(qb.andWhere.mock.calls).toEqual([
      ['artifact.deletedAt IS NULL'],
      ['artifact.ownerId = :accessViewerId', { accessViewerId: OWNER_ID }],
    ]);
  });

  it('logs denials at debug with ids and the reason only', () => {
    vi.mocked(logger.debug).mockClear();
    try {
      policy.assertCan(actor(OTHER_ID), 'edit', artifact());
    } catch {
      // Expected.
    }
    expect(logger.debug).toHaveBeenCalledWith(
      {
        userId: OTHER_ID,
        artifactId: '00000000-0000-4000-8000-0000000000aa',
        action: 'edit',
        reason: 'not_owner',
      },
      'Access denied',
    );
  });
});
