import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactsModule } from '../../artifacts/artifacts.module.js';
import { UploadSession } from './upload-session.entity.js';
import { UploadSessionsController } from './upload-sessions.controller.js';
import { UploadSessionsService } from './upload-sessions.service.js';

/** Upload sessions. Separate from `UploadsModule`, which `ArtifactsModule` itself needs. */
@Module({
  imports: [TypeOrmModule.forFeature([UploadSession]), ArtifactsModule],
  controllers: [UploadSessionsController],
  providers: [UploadSessionsService],
  exports: [UploadSessionsService],
})
export class UploadSessionsModule {}
