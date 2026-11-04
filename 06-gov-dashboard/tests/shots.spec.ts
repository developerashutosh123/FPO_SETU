import { test } from '@playwright/test';
// Not a pass/fail test: writes docs/screenshots/* for the report. Run with: pnpm exec playwright test tests/shots.spec.ts
const pages: [string, string, boolean][] = [
  ['ledger', '/ledger', false], ['ledger-trace', '/ledger?channel=trace-channel', false],
  ['tx-lien', '/ledger/tx/FIXTURE-b27a70a7227d', false], ['block', '/ledger/block/trace-channel/1189', false],
  ['login', '/login', false], ['overview', '/', true], ['network', '/network', true], ['lot', '/lots/089012340000004517', true],
];
for (const [vp, size] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  test.describe(vp, () => {
    test.use({ viewport: size });
    for (const [name, path, auth] of pages) {
      test(`${vp} ${name}`, async ({ page }) => {
        if (auth) {
          await page.goto('/login');
          await page.getByRole('button', { name: /observer\.gov/ }).click();
          await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
          await page.waitForURL('**/');
        }
        await page.goto(path);
        await page.waitForLoadState('load');
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `docs/screenshots/${vp}-${name}.png`, fullPage: true });
      });
    }
  });
}

test.describe('dark', () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  for (const [name, path] of [['ledger', '/ledger'], ['tx-lien', '/ledger/tx/FIXTURE-b27a70a7227d']] as const) {
    test(`dark ${name}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(1800);
      await page.screenshot({ path: `docs/screenshots/dark-${name}.png`, fullPage: true });
    });
  }
});
