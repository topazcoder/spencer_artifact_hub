import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  type ArtifactAccessResponse,
  type SetCompanyAccessOptions,
  type SetShareLinkOptions,
  type SharePeopleOptions,
  type UpdatePersonAccessOptions,
  setCompanyAccessRequestSchema,
  setShareLinkRequestSchema,
  sharePeopleRequestSchema,
  updatePersonAccessRequestSchema,
} from '@artifact-hub/shared';
import { CurrentActor } from '../auth/auth.decorators.js';
import type { Actor } from '../auth/auth.types.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { SharingService } from './sharing.service.js';

/** Access settings of an artifact; owner only. Every change returns the settings as they are now. */
@Controller('artifacts/:id/access')
export class SharingController {
  constructor(private readonly sharing: SharingService) {}

  @Get()
  async get(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.getAccess(actor, artifactId) };
  }

  @Put('company')
  async setCompany(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Body(new ZodValidationPipe(setCompanyAccessRequestSchema)) options: SetCompanyAccessOptions,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.setCompanyAccess(actor, artifactId, options) };
  }

  /** Answers 422 `SHARE_RECIPIENT_UNKNOWN`, listing them, if any email has no account. */
  @Post('people')
  async sharePeople(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Body(new ZodValidationPipe(sharePeopleRequestSchema)) options: SharePeopleOptions,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.sharePeople(actor, artifactId, options) };
  }

  @Patch('people/:userId')
  async updatePerson(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Param('userId') userId: string,
    @Body(new ZodValidationPipe(updatePersonAccessRequestSchema))
    changes: UpdatePersonAccessOptions,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.updatePerson(actor, artifactId, userId, changes) };
  }

  @Delete('people/:userId')
  async removePerson(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Param('userId') userId: string,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.removePerson(actor, artifactId, userId) };
  }

  /** Turns the link on, or changes its expiry or version; the URL stays the same. */
  @Put('link')
  async setLink(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
    @Body(new ZodValidationPipe(setShareLinkRequestSchema)) options: SetShareLinkOptions,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.setLink(actor, artifactId, options) };
  }

  @Delete('link')
  async turnOffLink(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.turnOffLink(actor, artifactId) };
  }

  /** A new URL for the link; the old one stops working. */
  @Post('link/reset')
  @HttpCode(HttpStatus.OK)
  async resetLink(
    @CurrentActor() actor: Actor,
    @Param('id') artifactId: string,
  ): Promise<ArtifactAccessResponse> {
    return { access: await this.sharing.resetLink(actor, artifactId) };
  }
}
