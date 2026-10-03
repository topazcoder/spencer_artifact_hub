import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_NAME } from '@artifact-hub/shared';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule);
app.setGlobalPrefix('api', { exclude: ['mcp'] });
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT ?? 3000));
new Logger('Bootstrap').log(`${APP_NAME} API listening on ${await app.getUrl()}`);
