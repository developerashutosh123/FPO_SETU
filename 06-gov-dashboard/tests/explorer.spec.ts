import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

test.describe('explorer search finds all four ID types', () => {
  const search = async (page: import('@playwright/test').Page, q: string) => {
    await page.goto('/ledger');
    await page.getByLabel('Transaction ID, lot SSCC, e-NWR or order ID').fill(q);
    await page.getByRole('button', { name: 'Search' }).click();
  };

  test('tx ID opens the transaction', async ({ page }) => {
    await search(page, SEED.tx);
    await expect(page).toHaveURL(new RegExp(`/ledger/tx/${SEED.tx}`));
  });
  test('SSCC offers the lot', async ({ page }) => {
    await search(page, SEED.sscc);
    const hit = page.getByTestId('search-results');
    await expect(hit).toContainText('Lot');
    await expect(hit.getByRole('link', { name: 'Open lot' })).toHaveAttribute('href', `/lots/${SEED.sscc}`);
  });
  test('e-NWR is found on finance-channel', async ({ page }) => {
    await search(page, SEED.enwr);
    await expect(page.getByTestId('search-results')).toContainText('e-NWR');
    await expect(page.getByTestId('search-results')).toContainText('finance-channel');
  });
  test('order ID is found on trade-channel', async ({ page }) => {
    await search(page, SEED.order);
    await expect(page.getByTestId('search-results')).toContainText('Order');
    await expect(page.getByTestId('search-results')).toContainText('trade-channel');
  });
  test('an unknown ID says so', async ({ page }) => {
    await search(page, 'ORD-2026-99999');
    await expect(page.getByTestId('search-results')).toContainText('Nothing on the ledger index matches');
  });
});

test('channel selector filters the block list and keeps the choice in the URL', async ({ page }) => {
  await page.goto('/ledger');
  await page.getByRole('button', { name: /finance/ }).click();
  await expect(page).toHaveURL(/channel=finance-channel/);
  await expect(page.getByRole('heading', { name: 'Latest blocks on finance-channel' })).toBeVisible();
  const cells = page.locator('tbody tr td:nth-child(1)');
  await expect(cells.first()).toContainText('#');
  await expect(page.getByText('Members of finance-channel')).toBeVisible();
});

test('the live line receives events from the stream', async ({ page }) => {
  await page.goto('/ledger');
  await expect(page.getByTestId('live-line')).toContainText('Last event:', { timeout: 15_000 });
});

test('the observer cannot see a price anywhere (no rupee sign on lot or overview pages)', async ({ page }) => {
  await signIn(page, 'observer.gov');
  await page.goto(`/lots/${SEED.sscc}`);
  await expect(page.getByRole('heading', { name: 'Sale' })).toBeVisible();
  const sale = page.locator('section', { has: page.getByRole('heading', { name: 'Sale' }) });
  await expect(sale).not.toContainText('₹');
  await expect(sale).toContainText('Private');
  await expect(page.locator('main')).not.toContainText('₹');
  await page.goto('/');
  await expect(page.getByTestId('gate')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('₹');
});
