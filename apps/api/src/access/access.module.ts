import { Module } from '@nestjs/common';
import { AccessGrantsService } from './access-grants.service.js';
import { AccessPolicyService } from './access-policy.service.js';

@Module({
  providers: [AccessPolicyService, AccessGrantsService],
  exports: [AccessPolicyService, AccessGrantsService],
})
export class AccessModule {}
