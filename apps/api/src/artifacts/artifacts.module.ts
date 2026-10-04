import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessModule } from '../access/access.module.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { ArtifactVersion } from './artifact-version.entity.js';
import { Artifact } from './artifact.entity.js';
import { ArtifactsController } from './artifacts.controller.js';
import { ArtifactsService } from './artifacts.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Artifact, ArtifactVersion]),
    AccessModule,
    IdempotencyModule,
    StorageModule,
    UploadsModule,
  ],
  controllers: [ArtifactsController],
  providers: [ArtifactsService],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
