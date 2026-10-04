import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorCode, type FeedbackSummaryQuery } from '@artifact-hub/shared';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Repository } from 'typeorm';
import { AccessPolicyService } from '../../access/access-policy.service.js';
import { AiUnavailableError } from '../../ai/ai.errors.js';
import { AiService } from '../../ai/ai.service.js';
import { ArtifactsService } from '../../artifacts/artifacts.service.js';
import type { Actor } from '../../auth/auth.types.js';
import { AppError } from '../../common/errors/app-error.js';
import { CommentsService } from '../comments.service.js';
import type { FeedbackSummaryView, SummaryScope } from './feedback-summaries.types.js';
import {
  FEEDBACK_SUMMARY_SYSTEM_PROMPT,
  feedbackSummaryAnswerSchema,
  summaryInput,
  summaryPrompt,
  toSummaryContent,
} from './feedback-summary-prompt.js';
import { FeedbackSummary } from './feedback-summary.entity.js';

/**
 * AI summaries of an artifact's comments (plan §9), for one version or every version the user
 * can see. Summaries are written on request only, by the smart model, and saved: asking again
 * returns the saved one until comments change (added, edited, resolved or deleted), when it is
 * outdated. Everyone who can read the comments can read and request their summary. The web
 * app's Feedback tab and MCP don't use them (MCP agents summarize raw threads themselves).
 */
@Injectable()
export class FeedbackSummariesService {
  constructor(
    @InjectRepository(FeedbackSummary) private readonly summaries: Repository<FeedbackSummary>,
    private readonly artifacts: ArtifactsService,
    private readonly comments: CommentsService,
    private readonly access: AccessPolicyService,
    private readonly ai: AiService,
    @InjectPinoLogger(FeedbackSummariesService.name) private readonly logger: PinoLogger,
  ) {}

  /** The saved summary, and whether comments changed since. Never calls AI. */
  async get(
    actor: Actor,
    artifactId: string,
    { version }: FeedbackSummaryQuery,
  ): Promise<FeedbackSummaryView> {
    const scope = await this.scope(actor, artifactId, version);
    if (scope.input.commentCount === 0) return { saved: null, outdated: false, versionNo: version };
    const saved = await this.find(scope);
    return {
      saved,
      outdated: saved !== null && saved.inputHash !== scope.inputHash,
      versionNo: version,
    };
  }

  /**
   * Summarizes the comments now, unless the saved summary is up to date. Nothing to summarize
   * without comments. `AI_UNAVAILABLE` when AI is off or fails; the saved summary stays.
   */
  async summarize(
    actor: Actor,
    artifactId: string,
    { version }: FeedbackSummaryQuery,
  ): Promise<FeedbackSummaryView> {
    const scope = await this.scope(actor, artifactId, version);
    if (scope.input.commentCount === 0) return { saved: null, outdated: false, versionNo: version };
    const saved = await this.find(scope);
    if (saved?.inputHash === scope.inputHash) return { saved, outdated: false, versionNo: version };

    const log = { userId: actor.userId, artifactId: scope.artifactId, versionNo: version };
    const answer = await this.ai
      .generate({
        purpose: 'feedback.summarize',
        tier: 'smart',
        system: FEEDBACK_SUMMARY_SYSTEM_PROMPT,
        prompt: summaryPrompt(scope.title, scope.input, { versionNo: version }),
        schema: feedbackSummaryAnswerSchema,
        maxOutputTokens: 16_000,
      })
      .catch((error: unknown) => {
        if (!(error instanceof AiUnavailableError)) throw error;
        this.logger.info({ ...log, reason: error.reason }, 'Feedback not summarized');
        throw new AppError(
          ErrorCode.AI_UNAVAILABLE,
          this.ai.enabled
            ? "Couldn't summarize the feedback right now. Try again in a few minutes."
            : 'Feedback summaries are not available.',
        );
      });

    const row = this.summaries.create({
      artifactId: scope.artifactId,
      versionIds: scope.versionIds,
      summary: toSummaryContent(answer.output, scope.input.refs),
      inputHash: scope.inputHash,
      commentCount: scope.input.commentCount,
      partial: scope.input.partial,
      model: answer.model,
      generatedAt: new Date(),
    });
    await this.summaries.upsert(row, ['artifactId', 'versionIds']);
    this.logger.info(
      { ...log, commentCount: row.commentCount, partial: row.partial, model: row.model },
      'Feedback summarized',
    );
    return { saved: row, outdated: false, versionNo: version };
  }

  /**
   * The comments on version `versionNo`, or on every version the actor can see, and the key
   * their summary is saved under. `NOT_FOUND` if the actor can't see the artifact or version.
   */
  private async scope(
    actor: Actor,
    artifactId: string,
    versionNo: number | undefined,
  ): Promise<SummaryScope> {
    const view = await this.artifacts.get(actor, artifactId);
    const threads = await this.comments.list(actor, view.artifact.id, {
      versionNo,
      include: 'all',
    });
    let versionIds: string[];
    if (versionNo === undefined) {
      // Viewers limited to pinned versions get summaries of those only, saved apart.
      const visible = this.access.visibleVersionIds(actor, view.target);
      versionIds = visible ? [...visible].toSorted() : [];
    } else {
      const versions = await this.artifacts.listVersions(actor, view.artifact.id);
      const version = versions.find((v) => v.versionNo === versionNo);
      if (!version) throw new AppError(ErrorCode.NOT_FOUND, 'Version not found.');
      versionIds = [version.id];
    }
    const input = summaryInput(threads, { showVersions: versionNo === undefined });
    return {
      title: view.artifact.title,
      versionNo,
      versionIds,
      artifactId: view.artifact.id,
      input,
      inputHash: createHash('sha256').update(input.text).digest('hex'),
    };
  }

  private find({ artifactId, versionIds }: SummaryScope): Promise<FeedbackSummary | null> {
    return this.summaries
      .createQueryBuilder('summary')
      .where('summary.artifactId = :artifactId', { artifactId })
      .andWhere('summary.versionIds = CAST(:versionIds AS uuid[])', { versionIds })
      .getOne();
  }
}
