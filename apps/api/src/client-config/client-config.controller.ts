import { Controller, Get } from '@nestjs/common';
import type { AppConfig } from '@artifact-hub/shared';
import { AiService } from '../ai/ai.service.js';
import { Public } from '../auth/auth.decorators.js';
import { InjectEnv } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';

/** Settings the web app needs before it talks to other endpoints. Nothing secret. */
@Public()
@Controller('config')
export class ClientConfigController {
  constructor(
    @InjectEnv() private readonly env: Env,
    private readonly ai: AiService,
  ) {}

  @Get()
  get(): AppConfig {
    return { maxArtifactBytes: this.env.MAX_ARTIFACT_BYTES, features: { ai: this.ai.enabled } };
  }
}
