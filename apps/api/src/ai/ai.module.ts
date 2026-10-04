import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import { AI_PROVIDER, createAiProvider } from './ai-provider.js';
import { AiService } from './ai.service.js';

@Module({
  providers: [{ provide: AI_PROVIDER, inject: [ENV], useFactory: createAiProvider }, AiService],
  exports: [AiService],
})
export class AiModule {}
