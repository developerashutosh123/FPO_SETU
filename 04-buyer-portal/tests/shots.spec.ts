import { test } from '@playwright/test';
import { LOT_GRADED, LOT_IN_TRANSIT, ORDER_AGREED, ORDER_OPEN, fpoSubmitsPrice, resetMock, signIn } from './helpers';

// Screenshots for docs/screenshots (run with `pnpm exec playwright test tests/shots.spec.ts`).
for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 390, height: 844 }]] as const) {
  test(`screenshots ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await resetMock();
    await page.setViewportSize(viewport);
    await signIn(page, '/');
    await page.getByTestId('lot-card').first().waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-catalogue.png`, fullPage: true });

    await page.goto(`/lots/${LOT_IN_TRANSIT}`);
    await page.getByTestId('proof-table').waitFor();
    await page.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 8000 }).catch(() => {}); // tiles need internet; the shot is still taken without them
    await page.screenshot({ path: `docs/screenshots/${name}-lot-spec-sheet.png`, fullPage: true });

    await page.goto('/orders');
    await page.getByTestId('order-table').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-orders.png`, fullPage: true });

    await page.goto(`/orders/${ORDER_OPEN}`);
    await page.getByTestId('price-form').waitFor();
    await page.getByLabel('Your price per quintal (₹)').fill('1500');
    await page.screenshot({ path: `docs/screenshots/${name}-price-form.png`, fullPage: true });
    await page.getByTestId('seal-price').click();
    await page.getByTestId('price-waiting').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-price-waiting.png`, fullPage: true });
    await resetMock();
    await page.reload();
    await fpoSubmitsPrice(ORDER_OPEN, 1500);
    await page.getByLabel('Your price per quintal (₹)').fill('1400');
    await page.getByTestId('seal-price').click();
    await page.getByTestId('price-mismatch').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-price-mismatch.png`, fullPage: true });

    await page.goto(`/orders/${ORDER_AGREED}`);
    await page.getByTestId('price-agreed').waitFor();
    await page.getByTestId('agreed-endorsers').getByText('BuyerOrgMSP').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-order-agreed.png`, fullPage: true });

    await page.goto(`/receive?sscc=${LOT_IN_TRANSIT}`);
    await page.getByTestId('accept-custody').waitFor();
    await page.getByTestId('try-fpo').click();
    await page.getByTestId('fpo-refused').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-receive-fpo-refused.png`, fullPage: true });
    await page.getByTestId('accept-custody').click();
    await page.getByTestId('custody-done').waitFor();
    await page.getByTestId('accept-quality').click();
    await page.getByTestId('quality-done').waitFor();
    await page.screenshot({ path: `docs/screenshots/${name}-receive-accepted.png`, fullPage: true });
    void LOT_GRADED;
  });
}
