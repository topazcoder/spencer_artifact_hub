import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [AiModule, ArtifactsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
