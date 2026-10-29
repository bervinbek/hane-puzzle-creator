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
  // The site project runs against the production build, as deployed, with no class inbox (the
  // default: nothing is ever sent). The inbox project runs a second build made in mode "inbox"
  // (file .env.inbox: a pretend address that the tests answer themselves) to test the Download
  // dialog that asks for a class code. The empty values below stop a real address in .env.local
  // from leaking into the first build.
  projects: [
    { name: 'site', testIgnore: /inbox\.spec\.ts/ },
    {
      name: 'inbox',
      testMatch: /inbox\.spec\.ts/,
      use: { baseURL: 'http://localhost:4174' },
    },
  ],
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_INBOX_URL: '', VITE_INBOX_KEY: '' },
    },
    {
      command:
        'npx vite build --mode inbox --outDir node_modules/.inbox-dist && npx vite preview --mode inbox --outDir node_modules/.inbox-dist --port 4174 --strictPort',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
