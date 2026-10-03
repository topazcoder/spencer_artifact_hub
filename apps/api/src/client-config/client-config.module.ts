import { Module } from '@nestjs/common';
import { ClientConfigController } from './client-config.controller.js';

@Module({ controllers: [ClientConfigController] })
export class ClientConfigModule {}
