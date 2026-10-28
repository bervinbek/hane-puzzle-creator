import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vitest/config';
import { cacheVersion, precacheFiles, serviceWorkerSource } from './tools/offline';

/** Writes sw.js, with a list of every file of the build, so the site works offline (tools/offline.ts). */
function offline(): Plugin {
  let base = '/';
  return {
    name: 'hane-offline',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      // Files in public/ are copied as they are, so they are not in the bundle; list them too.
      const publicNames = readdirSync('public').filter((n) => !n.startsWith('.'));
      const names = [...Object.keys(bundle), ...publicNames];
      const files = precacheFiles(names);
      const index = bundle['index.html'];
      const contents: (string | Uint8Array)[] = [
        index && index.type === 'asset' ? index.source : '',
        ...publicNames.map((n) => readFileSync(`public/${n}`)),
      ];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: serviceWorkerSource({ base, files, version: cacheVersion(files, contents) }),
      });
    },
  };
}

// CI sets BASE_PATH to "/<repo-name>/" for GitHub Pages; local dev uses "/".
export default defineConfig({
  plugins: [offline()],
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    // Geometry tests build many puzzles; give them room when the machine is busy.
    testTimeout: 30_000,
  },
});
