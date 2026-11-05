import { test } from '@playwright/test';
import { ENWR_PLEDGED, ORDER_OPEN, resetMock, signIn, SSCC_COMMISSIONED, SSCC_PLEDGED } from './helpers';

// Not an assertion test: writes the P2 screenshots to docs/screenshots (1366x768 desktop, one phone width).
test.skip(!process.env.SHOTS, 'set SHOTS=1 to write screenshots');
const out = (n: string) => ({ path: `docs/screenshots/${n}.png`, fullPage: true });

test('screenshots', async ({ page }) => {
  await resetMock();
  await page.goto('/login'); await page.screenshot(out('login'));
  await signIn(page, 'sujata.ceo');
  await page.getByTestId('exceptions').waitFor(); await page.waitForTimeout(1500); await page.screenshot(out('today'));
  await page.goto('/lots'); await page.getByTestId('lots-table').waitFor(); await page.screenshot(out('lots'));
  await page.goto(`/lots/${SSCC_PLEDGED}`); await page.getByTestId('pledged-notice').waitFor(); await page.screenshot(out('lot-detail'));
  await page.goto('/orders'); await page.getByTestId('orders-table').waitFor(); await page.screenshot(out('orders'));
  await page.goto(`/orders/${ORDER_OPEN}`); await page.getByTestId('agree-form').waitFor();
  await page.getByLabel('Price per quintal (₹)').fill('1580'); await page.getByTestId('agree-submit').click(); await page.getByTestId('agree-sent').waitFor(); await page.screenshot(out('order-agree-price'));
  await page.goto('/collateral'); await page.getByTestId('collateral-table').waitFor(); await page.screenshot(out('collateral'));
  await page.goto(`/collateral/${ENWR_PLEDGED}`); await page.getByTestId('loan').waitFor(); await page.screenshot(out('collateral-detail'));
  await page.evaluate(() => localStorage.clear());
  await signIn(page, 'debasis.ops', `/intake?sscc=${SSCC_COMMISSIONED}`);
  await page.getByTestId('station-lot').waitFor(); await page.keyboard.press('w'); await page.getByTestId('wb-reading').waitFor(); await page.screenshot(out('intake'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.waitForTimeout(1500); await page.screenshot(out('today-mobile'));
});
