import { InitExtensions1791025000463 } from './1791025000463-InitExtensions.js';
import { CreateUsersAndSessions1791100000000 } from './1791100000000-CreateUsersAndSessions.js';
import { CreateArtifacts1791200000000 } from './1791200000000-CreateArtifacts.js';
import { IndexPublicArtifacts1791300000000 } from './1791300000000-IndexPublicArtifacts.js';
import { CreateShares1791400000000 } from './1791400000000-CreateShares.js';
import { CreateShareLinks1791500000000 } from './1791500000000-CreateShareLinks.js';

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
];
