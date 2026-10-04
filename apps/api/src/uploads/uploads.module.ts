import { Module } from '@nestjs/common';
import { ContentInspectorService } from './content/content-inspector.service.js';

/** Content validation, used by every upload path. Upload sessions are in `sessions/`. */
@Module({
  providers: [ContentInspectorService],
  exports: [ContentInspectorService],
})
export class UploadsModule {}
