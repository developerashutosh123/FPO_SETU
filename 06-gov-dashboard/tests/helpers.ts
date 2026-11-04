import { expect, type Page } from '@playwright/test';

/** Seeded IDs from shared/fixtures (mock gateway). */
export const SEED = {
  tx: 'FIXTURE-2c55a19820d4',            // registerFarmerAndPlot, trace-channel block 1189
  lienTx: 'FIXTURE-b27a70a7227d',        // recordDeposit, finance-channel block 291
  channel: 'trace-channel', block: 1189,
  sscc: '089012340000004517', enwr: 'ENWR-NERL-2026-004211', order: 'ORD-2026-00087',
};

export async function signIn(page: Page, username: 'observer.gov' | 'board.fpo') {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill('Setu@2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}
