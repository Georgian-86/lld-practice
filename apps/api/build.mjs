// Bundles the API (and the shared package) into a single ESM file for production.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  // The shared workspace package is TypeScript source, so it must be bundled, not externalised.
  plugins: [
    {
      name: 'bundle-workspace',
      setup(b) {
        b.onResolve({ filter: /^@blueprint\// }, () => undefined);
      },
    },
  ],
  alias: { '@blueprint/shared': '../../packages/shared/src/index.ts' },
  logLevel: 'info',
});
