import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // The 3D screens are drawn in software on a build machine, which is slow when it is busy.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    // A pretend camera, so the camera tests need no hardware and no permission prompt.
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  // Smoke test runs against the production build, as deployed.
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
