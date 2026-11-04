import { test } from '@playwright/test';
import { ENWR_ACTIVE, ENWR_FREE, resetMock, signIn } from './helpers';

// Screenshots for docs/screenshots (run with `pnpm exec playwright test tests/shots.spec.ts`).
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  test(`screenshots ${name}`, async ({ page }) => {
    await resetMock();
    await page.setViewportSize(viewport);
    await signIn(page, '/collateral');
    await page.getByTestId('collateral-table').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-collateral.png`, fullPage: true });
    await page.goto(`/collateral/${ENWR_ACTIVE}`);
    await page.getByTestId('duplicate-btn').click();
    await page.getByTestId('double-financing').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-collateral-view-duplicate-rejected.png`, fullPage: true });
    await page.goto(`/collateral/${ENWR_FREE}`);
    await page.getByTestId('mark-lien').click();
    await page.getByLabel('Interest rate (% a year)').fill('9.5');
    await page.getByTestId('lien-submit').click();
    await page.getByTestId('receipt').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-lien-receipt.png` });
    await page.goto('/loans');
    await page.getByTestId('loan-table').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-loans.png`, fullPage: true });
    await page.goto('/loans/LN-2026-00041');
    await page.getByTestId('repay').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-loan.png`, fullPage: true });
  });
}
