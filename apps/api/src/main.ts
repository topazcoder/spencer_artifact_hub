import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { InvalidEnvError, parseEnv } from './config/env.js';

if (existsSync('.env')) process.loadEnvFile('.env');

let env;
try {
  env = parseEnv(process.env);
} catch (error) {
  if (!(error instanceof InvalidEnvError)) throw error;
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

const app = await NestFactory.create(AppModule.register(env), { bufferLogs: true });
configureApp(app);
await app.listen(env.PORT);
app.get(Logger).log(`API listening on port ${env.PORT} (${env.NODE_ENV})`, 'Bootstrap');
