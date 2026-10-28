import { defineConfig } from 'vitest/config';

// CI sets BASE_PATH to "/<repo-name>/" for GitHub Pages; local dev uses "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022' },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
});
