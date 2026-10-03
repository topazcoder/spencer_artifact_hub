import { DynamicModule, Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';

/** Serves the built SPA with an index.html fallback, leaving `/api` and `/mcp` to Nest. */
@Module({})
export class WebModule {
  static register(webDistDir: string | undefined): DynamicModule {
    if (!webDistDir) return { module: WebModule };
    return {
      module: WebModule,
      imports: [
        ServeStaticModule.forRoot({
          rootPath: webDistDir,
          exclude: /^\/(api|mcp)(\/|$)/,
          serveStaticOptions: {
            setHeaders: (res, filePath) => {
              // Vite fingerprints everything under assets/; index.html must always be revalidated.
              res.setHeader(
                'Cache-Control',
                filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
              );
            },
          },
        }),
      ],
    };
  }
}
