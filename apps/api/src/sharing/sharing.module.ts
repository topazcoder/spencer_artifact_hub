import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { Artifact } from '../artifacts/artifact.entity.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { User } from '../users/user.entity.js';
import { Share } from './share.entity.js';
import { SharingController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Share, Artifact, ArtifactVersion, User]), ArtifactsModule],
  controllers: [SharingController],
  providers: [SharingService],
})
export class SharingModule {}
