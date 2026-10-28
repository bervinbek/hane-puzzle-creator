// Draws the app icons (public/*.png) from the same little puzzle piece as the favicon.
// Run once with `node tools/make-icons.mjs`; the PNGs are committed, so a normal build needs no browser.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const RED = '#d8261c';
const CREAM = '#fbf4ee';
const PIECE = 'M9 11h6a3 3 0 1 1 6 0h2v5a3 3 0 1 1 0 6v3H9z';

/** `rounded`: a rounded square (for the browser). Otherwise full bleed, so a phone can cut its own shape. */
const svg = (size, { rounded, piece }) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  ${rounded ? `<rect width="32" height="32" rx="8" fill="${RED}"/>` : `<rect width="32" height="32" fill="${RED}"/>`}
  <g transform="translate(16 18) scale(${piece}) translate(-16 -18)"><path d="${PIECE}" fill="${CREAM}"/></g>
</svg>`;

const icons = [
  ['public/icon-192.png', 192, { rounded: true, piece: 1 }],
  ['public/icon-512.png', 512, { rounded: true, piece: 1 }],
  // Maskable: the piece stays inside the middle 60 % so any mask shape keeps it whole.
  ['public/icon-maskable-512.png', 512, { rounded: false, piece: 0.78 }],
  ['public/apple-touch-icon.png', 180, { rounded: false, piece: 0.9 }],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, options] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg(size, options)}</body>`,
  );
  await writeFile(file, await page.screenshot({ omitBackground: true }));
  console.log('wrote', file);
}
await browser.close();
