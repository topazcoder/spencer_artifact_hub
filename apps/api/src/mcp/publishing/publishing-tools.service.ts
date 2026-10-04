import { Injectable } from '@nestjs/common';
import {
  ARTIFACT_DESCRIPTION_MAX_LENGTH,
  ARTIFACT_TAG_MAX_LENGTH,
  ARTIFACT_TAGS_MAX,
  ARTIFACT_TITLE_MAX_LENGTH,
  createArtifactRequestSchema,
  ErrorCode,
  TEXT_FORMAT_MIME_TYPES,
  type TextFormat,
  updateArtifactRequestSchema,
  VERSION_CHANGE_NOTE_MAX_LENGTH,
} from '@artifact-hub/shared';
import { z } from 'zod';
import { ArtifactsService } from '../../artifacts/artifacts.service.js';
import type { ArtifactView } from '../../artifacts/artifacts.types.js';
import type { Actor } from '../../auth/auth.types.js';
import { AppError } from '../../common/errors/app-error.js';
import { InjectEnv } from '../../config/config.module.js';
import type { Env } from '../../config/config.types.js';
import { artifactPageUrl } from '../app-urls.js';
import { parseArtifactRef } from '../artifact-ref.js';
import { defineTool } from '../define-tool.js';
import type { McpTool, McpToolProvider } from '../mcp.types.js';
import { typeName } from '../type-names.js';
import { formatForRevision, inlineContent, inlineContentError } from './inline-content.js';

const FORMATS = Object.keys(TEXT_FORMAT_MIME_TYPES) as [TextFormat, ...TextFormat[]];

const title = z.string().trim().min(1).max(ARTIFACT_TITLE_MAX_LENGTH);
const description = z.string().trim().min(1).max(ARTIFACT_DESCRIPTION_MAX_LENGTH);
const tags = z
  .array(z.string().trim().min(1).max(ARTIFACT_TAG_MAX_LENGTH))
  .min(1)
  .max(ARTIFACT_TAGS_MAX);
const content = z.string().min(1);

const METADATA_ADVICE =
  'Write it from what you know about the content and the conversation: it is how people find the artifact in the gallery and in search.';

/** Publishing artifacts from text the agent generated, and revising them. */
@Injectable()
export class PublishingToolsService implements McpToolProvider {
  constructor(
    private readonly artifacts: ArtifactsService,
    @InjectEnv() private readonly env: Env,
  ) {}

  tools(): McpTool[] {
    return [this.publishArtifact(), this.updateArtifact()];
  }

  private publishArtifact() {
    return defineTool({
      name: 'publish_artifact',
      title: 'Publish an artifact',
      description:
        'Publish a new artifact from text you generated or have: an HTML page, an SVG image or a Markdown document ("publish this mockup", "put this report on Artifact Hub"). It starts private, visible only to the user: to share it, call share_artifact next. For a new version of something already published, use update_artifact instead.',
      inputSchema: {
        title: title.describe(`A short, specific title. ${METADATA_ADVICE}`),
        description: description.describe(
          `One to three sentences on what it is and what it is for. ${METADATA_ADVICE}`,
        ),
        tags: tags.describe(
          `1 to ${ARTIFACT_TAGS_MAX} short lowercase topic tags, e.g. ["pricing", "mockup"]. Reuse tags you've seen in find_artifacts results where they fit.`,
        ),
        format: z.enum(FORMATS).describe('The format of content.'),
        content: content.describe(
          `The complete document as text, at most ${formatMegabytes(this.env.MAX_ARTIFACT_BYTES)}. HTML must be a full page; SVG must have an <svg> root.`,
        ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (actor, input) => {
        const metadata = createArtifactRequestSchema.parse({
          title: input.title,
          description: input.description,
          tags: input.tags,
        });
        const view = await this.artifacts
          .create(actor, metadata, inlineContent(input.content, input.format))
          .catch((error: unknown) => {
            throw inlineContentError(error, input.format);
          });
        return {
          artifact: this.summary(view),
          next_actions: [
            'Give the user the url.',
            'It is private: call share_artifact to share it with people, the company or a link.',
          ],
        };
      },
    });
  }

  private updateArtifact() {
    return defineTool({
      name: 'update_artifact',
      title: 'Update an artifact',
      description:
        'Change an artifact the user owns: publish revised content as a new version ("here\'s the revised version", "apply the feedback"), or change its title, description or tags ("rename it"). New content always adds a version; earlier versions and their comments stay. Who can see it is changed with share_artifact and manage_access, not here.',
      inputSchema: {
        artifact: z.string().describe("The artifact's id, or its page URL (…/artifacts/<id>)."),
        content: content
          .optional()
          .describe(
            `The complete new version as text, at most ${formatMegabytes(this.env.MAX_ARTIFACT_BYTES)}. Omit to change only the details.`,
          ),
        format: z
          .enum(FORMATS)
          .optional()
          .describe("The format of content. Default: the current version's, if it is text."),
        change_note: z
          .string()
          .trim()
          .max(VERSION_CHANGE_NOTE_MAX_LENGTH)
          .optional()
          .describe('With content: what changed in this version, in a sentence.'),
        title: title.optional().describe('A new title.'),
        description: description.optional().describe('A new description.'),
        tags: tags.optional().describe('The new tags, replacing the current ones.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      handler: async (actor, input) => {
        const ref = parseArtifactRef(input.artifact);
        // Only the details given: an undefined key would count as a change.
        const details = Object.fromEntries(
          Object.entries({
            title: input.title,
            description: input.description,
            tags: input.tags,
          }).filter(([, value]) => value !== undefined),
        );
        const detailsGiven = Object.keys(details).length > 0;
        if (input.content === undefined && !detailsGiven) {
          throw new AppError(
            ErrorCode.VALIDATION_FAILED,
            'Send content for a new version, or a new title, description or tags.',
          );
        }

        const changes = detailsGiven ? updateArtifactRequestSchema.parse(details) : null;
        // Content first: if it is refused, the details stay as they were too.
        const versioned =
          input.content === undefined
            ? null
            : await this.addVersion(actor, ref.id, input.content, input.format, input.change_note);
        const view = changes
          ? await this.artifacts.update(actor, ref.id, changes)
          : (versioned ?? (await this.artifacts.get(actor, ref.id)));

        return {
          artifact: this.summary(view),
          new_version: versioned ? view.latestVersionNo : null,
          changed_details: changes ? Object.keys(changes) : [],
          next_actions: ['Give the user the url.'],
        };
      },
    });
  }

  private async addVersion(
    actor: Actor,
    artifactId: string,
    text: string,
    format: TextFormat | undefined,
    changeNote: string | undefined,
  ): Promise<ArtifactView> {
    const current = format
      ? null
      : (await this.artifacts.getForAction(actor, artifactId, 'edit')).currentVersion;
    const textFormat = formatForRevision(format, current);
    return this.artifacts
      .addVersion(
        actor,
        artifactId,
        { changeNote: changeNote ?? '' },
        inlineContent(text, textFormat),
      )
      .catch((error: unknown) => {
        throw inlineContentError(error, textFormat);
      });
  }

  /** What publish and update tell the agent about the artifact, as it now is. */
  private summary({ artifact, currentVersion }: ArtifactView) {
    return {
      id: artifact.id,
      title: artifact.title,
      description: artifact.description,
      tags: artifact.tags,
      url: artifactPageUrl(this.env.APP_BASE_URL, artifact.id),
      version: currentVersion && {
        number: currentVersion.versionNo,
        type: typeName(currentVersion.mimeType),
        size_bytes: currentVersion.sizeBytes,
        change_note: currentVersion.changeNote,
      },
    };
  }
}

function formatMegabytes(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
