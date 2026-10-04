import { InitExtensions1791025000463 } from './1791025000463-InitExtensions.js';
import { CreateUsersAndSessions1791100000000 } from './1791100000000-CreateUsersAndSessions.js';
import { CreateArtifacts1791200000000 } from './1791200000000-CreateArtifacts.js';
import { IndexPublicArtifacts1791300000000 } from './1791300000000-IndexPublicArtifacts.js';
import { CreateShares1791400000000 } from './1791400000000-CreateShares.js';
import { CreateShareLinks1791500000000 } from './1791500000000-CreateShareLinks.js';
import { AddArtifactSearch1791600000000 } from './1791600000000-AddArtifactSearch.js';
import { CreateComments1791700000000 } from './1791700000000-CreateComments.js';
import { CreateApiTokens1791800000000 } from './1791800000000-CreateApiTokens.js';
import { CreateUploadSessions1791900000000 } from './1791900000000-CreateUploadSessions.js';
import { CreateIdempotencyKeys1792000000000 } from './1792000000000-CreateIdempotencyKeys.js';

/**
 * Every migration, in order. Listed explicitly (not globbed) so the same list works from
 * `dist/`, from tsx and from vitest. Add new migrations to the end.
 */
export const migrations = [
  InitExtensions1791025000463,
  CreateUsersAndSessions1791100000000,
  CreateArtifacts1791200000000,
  IndexPublicArtifacts1791300000000,
  CreateShares1791400000000,
  CreateShareLinks1791500000000,
  AddArtifactSearch1791600000000,
  CreateComments1791700000000,
  CreateApiTokens1791800000000,
  CreateUploadSessions1791900000000,
  CreateIdempotencyKeys1792000000000,
];
