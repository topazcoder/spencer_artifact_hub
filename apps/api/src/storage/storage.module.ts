import { Inject, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/config.types.js';
import { LocalStorageService } from './local-storage.service.js';
import type { StorageDriver } from './storage.types.js';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** Injects the configured `StorageDriver`. */
export const InjectStorage = () => Inject(STORAGE_DRIVER);

/** Builds the driver selected by `STORAGE_DRIVER`. */
export async function createStorageDriver(env: Env): Promise<StorageDriver> {
  switch (env.STORAGE_DRIVER) {
    case 'local': {
      const driver = new LocalStorageService(env.STORAGE_LOCAL_ROOT);
      await driver.init();
      return driver;
    }
    case 's3':
    case 'azure':
      // The StorageDriver interface is the extension point; see docs/ENHANCEMENTS.md.
      throw new Error(`STORAGE_DRIVER=${env.STORAGE_DRIVER} is not implemented yet; use "local"`);
  }
}

@Module({
  providers: [{ provide: STORAGE_DRIVER, inject: [ENV], useFactory: createStorageDriver }],
  exports: [STORAGE_DRIVER],
})
export class StorageModule {}
