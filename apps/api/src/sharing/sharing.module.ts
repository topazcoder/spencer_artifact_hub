import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArtifactVersion } from '../artifacts/artifact-version.entity.js';
import { Artifact } from '../artifacts/artifact.entity.js';
import { AccessModule } from '../access/access.module.js';
import { ArtifactsModule } from '../artifacts/artifacts.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { User } from '../users/user.entity.js';
import { LinkTokenCipherService } from './links/link-token-cipher.service.js';
import { ShareLink } from './links/share-link.entity.js';
import { ShareLinksController } from './links/share-links.controller.js';
import { ShareLinksService } from './links/share-links.service.js';
import { Share } from './share.entity.js';
import { SharingController } from './sharing.controller.js';
import { SharingService } from './sharing.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Share, ShareLink, Artifact, ArtifactVersion, User]),
    AccessModule,
    ArtifactsModule,
    StorageModule,
  ],
  controllers: [SharingController, ShareLinksController],
  providers: [SharingService, ShareLinksService, LinkTokenCipherService],
})
export class SharingModule {}
