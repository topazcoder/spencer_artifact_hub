import { ErrorCode } from '@artifact-hub/shared';
import { z } from 'zod';
import { AppError } from '../common/errors/app-error.js';
import type { ArtifactRef } from './mcp.types.js';

const idSchema = z.guid();
const ARTIFACT_PATH = /^\/artifacts\/([^/]+)\/?$/;
const SHARE_LINK_PATH = /^\/s\/[^/]+\/?$/;
const VERSION_PARAM = /^[1-9]\d{0,8}$/;

/**
 * Reads the artifact an agent names: its id, or its page URL (`…/artifacts/<id>`, optionally
 * with `?v=N`), as users paste them. Any host is accepted; only the path matters.
 */
export function parseArtifactRef(input: string): ArtifactRef {
  const value = input.trim();
  if (idSchema.safeParse(value).success) return { id: value.toLowerCase() };

  const url = URL.canParse(value) ? new URL(value) : null;
  if (url && SHARE_LINK_PATH.test(url.pathname)) {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      "That's a share link for people outside the company. Pass the artifact's id or its page URL (…/artifacts/<id>) instead, or use find_artifacts.",
    );
  }
  const id = url ? ARTIFACT_PATH.exec(url.pathname)?.[1] : undefined;
  if (!id || !idSchema.safeParse(id).success) {
    throw new AppError(
      ErrorCode.VALIDATION_FAILED,
      "Pass the artifact's id or its page URL (…/artifacts/<id>). Use find_artifacts to look it up.",
    );
  }
  const version = url?.searchParams.get('v');
  return {
    id: id.toLowerCase(),
    ...(version && VERSION_PARAM.test(version) ? { versionNo: Number(version) } : {}),
  };
}
