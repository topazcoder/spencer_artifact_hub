import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UploadSessionsModule } from '../uploads/sessions/upload-sessions.module.js';
import { SweeperService } from './sweeper.service.js';

@Module({
  imports: [ArtifactsModule, UploadSessionsModule, IdempotencyModule, StorageModule],
  providers: [SweeperService],
  exports: [SweeperService],
})
export class SweeperModule {}
