import { expect, test } from '@playwright/test';
import { LOT_DELIVERED, LOT_IN_TRANSIT, ORDER_AGREED, ORDER_IN_TRANSIT, ORDER_OPEN, fpoSubmitsPrice, resetMock, signIn } from './helpers';

// PORTAL_COMMON section D: every inbound route renders real content for a seeded ID, not a 404 or an empty state.
test.beforeEach(async () => { await resetMock(); });

test('inbound /lots/{sscc} renders the spec sheet', async ({ page }) => {
  await signIn(page, `/lots/${LOT_IN_TRANSIT}`);
  for (const sscc of [LOT_IN_TRANSIT, LOT_DELIVERED]) {
    await page.goto(`/lots/${sscc}`);
    await expect(page.getByTestId('lot-ref')).toContainText('WB-PSM-');
    await expect(page.getByTestId('proof-table').locator('tbody tr').first()).toBeVisible();
  }
});

test('inbound /orders/{orderId} renders the order', async ({ page }) => {
  await signIn(page, `/orders/${ORDER_AGREED}`);
  for (const id of [ORDER_AGREED, ORDER_IN_TRANSIT]) {
    await page.goto(`/orders/${id}`);
    await expect(page.getByTestId('order-id')).toHaveText(id);
    await expect(page.getByTestId('order-ssccs').locator('li').first()).toBeVisible();
    await expect(page.getByTestId('order-proofs').locator('tbody tr').first()).toBeVisible();
  }
});

test('an unknown lot or order is a designed not-found state', async ({ page }) => {
  await signIn(page, '/lots/089012340000009994');
  await expect(page.getByText('No lot with this SSCC')).toBeVisible();
  await page.goto('/lots/12345');
  await expect(page.getByText('That is not a valid SSCC')).toBeVisible();
  await page.goto('/orders/ORD-2026-99999');
  await expect(page.getByText('No order with this ID')).toBeVisible();
});

test('signed-out visitors are sent to sign in and come back to the page they asked for', async ({ page }) => {
  await page.goto(`/lots/${LOT_IN_TRANSIT}`);
  await expect(page).toHaveURL(/\/login\?next=%2Flots%2F/);
  await page.getByRole('button', { name: /rahul\.buyer/ }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/lots/${LOT_IN_TRANSIT}$`));
});

test('the live activity toast links the transaction to the Gov explorer and never shows finance events', async ({ page }) => {
  const connected = page.waitForResponse((r) => r.url().endsWith('/events/stream'));
  await signIn(page, '/');
  await connected;
  // the mock only replays old fixture events slowly, so make the FPO act: its price step is a trade-channel event the buyer may see
  await fpoSubmitsPrice(ORDER_OPEN, 1500);
  const toast = page.getByTestId('toast').first();
  await expect(toast).toContainText(`Price step committed · order ${ORDER_OPEN}`);
  await expect(toast.getByRole('link')).toHaveAttribute('href', /\/ledger\/tx\//);
  const all = await page.getByTestId('toast').allInnerTexts();
  for (const t of all) expect(t).not.toMatch(/lien|loan|e-NWR|deposit/i);
});

test('the demo bar names the step this portal owns', async ({ page }) => {
  await signIn(page, '/receive');
  await expect(page.getByTestId('demo-bar')).toContainText('Step 8 of 10');
  await page.goto(`/orders/${ORDER_AGREED}`);
  await expect(page.getByTestId('demo-bar')).toContainText('Step 7 of 10');
  await expect(page.getByTestId('demo-bar').getByRole('link')).toHaveAttribute('href', new RegExp(`/orders/${ORDER_AGREED}$`));
});
