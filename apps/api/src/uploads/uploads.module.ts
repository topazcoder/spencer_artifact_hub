import { Module } from '@nestjs/common';
import { ContentInspectorService } from './content/content-inspector.service.js';

/** Content validation now; upload sessions (the MCP binary flow) join it in step 21. */
@Module({
  providers: [ContentInspectorService],
  exports: [ContentInspectorService],
})
export class UploadsModule {}
