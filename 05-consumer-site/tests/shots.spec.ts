import { test } from '@playwright/test';

// Not an assertion test: writes the P2 screenshots to docs/screenshots/ (run: pnpm test:e2e tests/shots.spec.ts).
const pages: [string, string][] = [
  ['home', '/'],
  ['home-bn', '/?lang=bn'],
  ['lot', '/00/089012340000004517'],
  ['lot-bn', '/00/089012340000004517?lang=bn'],
  ['lot-breach', '/00/089012340000004623'],
  ['lot-phi-false', '/00/089012340000004807'],
  ['not-found', '/00/089012340000004000'],
];
for (const [name, url] of pages) {
  for (const [vp, size] of [['mobile', { width: 360, height: 800 }], ['desktop', { width: 1280, height: 900 }]] as const) {
    test(`shot ${name} ${vp}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size });
      const page = await ctx.newPage();
      await page.goto(url);
      await page.screenshot({ path: `docs/screenshots/${name}-${vp}.png`, fullPage: true });
      await ctx.close();
    });
  }
}
