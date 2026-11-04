import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

// Every inbound route other portals link to (contract section 9.2) must render real content for a seeded ID.
test.describe('inbound routes', () => {
  test('/ledger/tx/{txId} renders the commit record, endorsers and keys, without signing in', async ({ page }) => {
    const res = await page.goto(`/ledger/tx/${SEED.tx}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('registerFarmerAndPlot');
    await expect(page.getByTestId('tx-summary')).toContainText('registered a farmer and plot');
    await expect(page.getByText(SEED.tx).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Endorsing organisations' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Endorsing organisations' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Keys written' })).toBeVisible();
    await expect(page.getByText('FARMER_FT-9c2e41a07b55d3f1').first()).toBeVisible();
  });

  test('a finance tx shows its two endorsers and the plain-English line', async ({ page }) => {
    await page.goto(`/ledger/tx/${SEED.lienTx}`);
    await expect(page.getByTestId('tx-summary')).toHaveText('FPO and Bank jointly recorded a storage deposit for lot 089012340000004524.');
    await expect(page.getByRole('list', { name: 'Endorsing organisations' }).getByRole('listitem')).toHaveCount(2);
  });

  test('/ledger/block/{channel}/{n} renders the header, the chain and the tx list', async ({ page }) => {
    const res = await page.goto(`/ledger/block/${SEED.channel}/${SEED.block}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('#1,189');
    await expect(page.getByTestId('chain').getByRole('listitem').filter({ hasText: 'This block' })).toBeVisible();
    await page.getByRole('link', { name: /FIXTURE-2c/ }).click();
    await expect(page).toHaveURL(new RegExp(`/ledger/tx/${SEED.tx}`));
  });

  test('unknown tx and block give a real 404 with a way back', async ({ page }) => {
    expect((await page.goto('/ledger/tx/NOPE'))?.status()).toBe(404);
    await expect(page.getByText('No transaction with this ID')).toBeVisible();
    expect((await page.goto('/ledger/block/trace-channel/999999'))?.status()).toBe(404);
    await expect(page.getByRole('link', { name: 'Open the Ledger Explorer' })).toBeVisible();
  });

  test('/lots/{sscc} sends a signed-out visitor to sign-in, then lands on the lot', async ({ page }) => {
    await page.goto(`/lots/${SEED.sscc}`);
    await expect(page).toHaveURL(/\/login\?next=%2Flots%2F0890/);
    await page.getByLabel('Username').fill('observer.gov');
    await page.getByLabel('Password').fill('Setu@2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`/lots/${SEED.sscc}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00451');
    await expect(page.getByTestId('timeline').getByRole('listitem').first()).toBeVisible();
    await expect(page.getByTestId('timeline').getByText('Lot commissioned')).toBeVisible();
  });

  test('the observer lot page has no link out to other portals; the board has one to the FPO console', async ({ page }) => {
    await signIn(page, 'observer.gov');
    await page.goto(`/lots/${SEED.sscc}`);
    await expect(page.getByTestId('role-note')).toContainText('Observer view');
    await expect(page.getByRole('link', { name: /Open in FPO console/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await signIn(page, 'board.fpo');
    await page.goto(`/lots/${SEED.sscc}`);
    await expect(page.getByRole('link', { name: /Open in FPO console/ })).toHaveAttribute('href', `http://localhost:3002/lots/${SEED.sscc}`);
  });

  test('/network shows peers, the Raft leaders and the org by channel matrix', async ({ page }) => {
    await signIn(page, 'observer.gov');
    await page.goto('/network');
    await expect(page.getByTestId('peers').getByRole('row')).toHaveCount(5);
    await expect(page.getByTestId('orderers').getByRole('row').filter({ hasText: 'orderer3' })).toContainText('trace and finance-channel');
    const regulator = page.getByTestId('matrix').getByRole('row').filter({ hasText: 'Regulator' });
    await expect(regulator.getByText('Not a member')).toHaveCount(1);
    await expect(page.getByText('Why the Regulator has no seat on trade-channel')).toBeVisible();
  });

  test('/ gates on sign-in, then shows the KPI cards and the four gate criteria', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, 'observer.gov');
    await page.goto('/');
    await expect(page.getByTestId('gate').getByRole('listitem')).toHaveCount(4);
    await expect(page.getByTestId('kpi-cards').getByRole('listitem')).toHaveCount(8);
    await expect(page.getByTestId('kpi-pledge_reach')).toContainText('2 of 7');
  });
});
