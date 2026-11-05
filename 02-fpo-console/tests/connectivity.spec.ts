import { expect, test } from '@playwright/test';
import { ENWR_PLEDGED, ORDER_DELIVERED, resetMock, signIn, SSCC_PLEDGED } from './helpers';

// PORTAL_COMMON.md section D: every inbound route other portals link to must render real content for a seeded ID.
test.beforeEach(async () => { await resetMock(); });

test('inbound /lots/{sscc}, /orders/{orderId} and /collateral/{enwr} render real records', async ({ page }) => {
  await signIn(page, 'sujata.ceo');
  await page.goto(`/lots/${SSCC_PLEDGED}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00452');
  await expect(page.getByRole('navigation', { name: 'Open this lot in another portal' })).toContainText('Consumer page');
  await page.goto(`/orders/${ORDER_DELIVERED}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(ORDER_DELIVERED);
  await page.goto(`/collateral/${ENWR_PLEDGED}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(ENWR_PLEDGED);
});

test('an inbound link while signed out goes to sign-in and comes back to the same record', async ({ page }) => {
  await page.goto(`/orders/${ORDER_DELIVERED}`);
  await expect(page).toHaveURL(/\/login\?next=%2Forders%2FORD-2026-00090/);
  await page.getByRole('button', { name: /sujata\.ceo/ }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_DELIVERED}$`));
});

test('an unknown lot is a designed not-found, not a blank page', async ({ page }) => {
  await signIn(page, 'sujata.ceo', '/lots/089012340000009999');
  await expect(page.getByText('No lot 089012340000009999')).toBeVisible();
});

test('every tx link goes to the Gov explorer', async ({ page }) => {
  await signIn(page, 'sujata.ceo', `/lots/${SSCC_PLEDGED}`);
  await page.getByRole('button', { name: /Lien proof/ }).click();
  await expect(page.getByTestId('proof-drawer').getByRole('link', { name: /Open in the Gov explorer/ })).toHaveAttribute('href', /localhost:3006\/ledger\/tx\/FIXTURE-/);
});
