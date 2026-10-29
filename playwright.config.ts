import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // The 3D screens are drawn in software on a build machine, which is slow when it is busy.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    // The Print step prints by itself unless motion is reduced, and the 3D screen is drawn in
    // software here. Most tests are not about motion, so they start with it reduced; the ones
    // that need it opt back in with test.use({ reducedMotion: 'no-preference' }).
    reducedMotion: 'reduce',
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
