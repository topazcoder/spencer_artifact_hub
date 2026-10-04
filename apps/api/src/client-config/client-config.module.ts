import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ClientConfigController } from './client-config.controller.js';

@Module({ imports: [AiModule], controllers: [ClientConfigController] })
export class ClientConfigModule {}
