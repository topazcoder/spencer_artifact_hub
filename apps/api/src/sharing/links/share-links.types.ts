import type { ArtifactVersion } from '../../artifacts/artifact-version.entity.js';
import type { ArtifactContent } from '../../artifacts/artifacts.types.js';
import type { ShareLink } from './share-link.entity.js';

/** What the owner chooses for the link. */
export interface LinkSettings {
  /** Null = never expires. */
  expiresAt: Date | null;
  /** Null = all versions, following the latest. */
  pinnedVersion: ArtifactVersion | null;
}

/** A link that works: the version it shows, ready to stream. */
export interface OpenedLink extends ArtifactContent {
  link: ShareLink;
}
