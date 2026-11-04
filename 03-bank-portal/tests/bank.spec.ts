import { expect, test } from '@playwright/test';
import { ENWR_ACTIVE, ENWR_FREE, resetMock, signIn, stubLoan } from './helpers';

test.beforeEach(async () => { await resetMock(); });

test('collateral search lists receipts and finds one by e-NWR', async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId('collateral-table').locator('tbody tr')).toHaveCount(4);
  await page.getByLabel('e-NWR or SSCC').fill(ENWR_ACTIVE);
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('collateral-table').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('lien-chip')).toHaveText('Lien active');
});

test('collateral view shows the valuation with its formula and no personal data', async ({ page }) => {
  await signIn(page, `/collateral/${ENWR_ACTIVE}`);
  await expect(page.getByTestId('valuation')).toContainText('× (1 − 20%)');
  await expect(page.getByTestId('price-basis')).toContainText('Medinipur (West)');
  await expect(page.getByText('Personal data and cultivation records are not shared with lenders.')).toBeVisible();
  await expect(page.getByTestId('cgs')).toBeVisible();
  await page.getByRole('button', { name: /Lien proof/ }).click();
  await expect(page.getByTestId('proof-drawer')).toContainText('finance-channel');
});

test('golden step 6: mark a lien, then a second lien is rejected with ERR_DOUBLE_FINANCING', async ({ page }) => {
  await signIn(page, `/collateral/${ENWR_FREE}`);
  await page.getByTestId('mark-lien').click();
  const dialog = page.getByTestId('lien-dialog');
  await expect(dialog.getByText('Loan terms are stored privately between the bank and the FPO.')).toBeVisible();
  await dialog.getByLabel('Amount (₹)').fill('99999999');
  await dialog.getByLabel('Interest rate (% a year)').fill('9.5');
  await dialog.getByTestId('lien-submit').click();
  await expect(dialog.getByRole('alert')).toContainText('cannot exceed the eligible loan');
  await dialog.getByLabel('Amount (₹)').fill('60000');
  await dialog.getByTestId('lien-submit').click();
  const receipt = dialog.getByTestId('receipt');
  await expect(receipt).toBeVisible();
  await expect(receipt.getByTestId('endorsers')).toContainText('FpoOrgMSP');
  await expect(receipt.getByTestId('endorsers')).toContainText('BankOrgMSP');
  await expect(receipt.getByRole('link', { name: /FIXTURE-/ }).first()).toHaveAttribute('href', /\/ledger\/tx\/FIXTURE-/);
  const lienTx = (await receipt.locator('.mono').first().textContent())!.trim();

  await dialog.getByTestId('duplicate-btn').click();
  const dup = dialog.getByTestId('double-financing');
  await expect(dup.getByTestId('error-code')).toHaveText('ERR_DOUBLE_FINANCING');
  await expect(dup.getByTestId('error-message')).toContainText('already has an active lien');
  await expect(dup.getByTestId('existing-lien-tx')).toContainText(lienTx);
  await expect(dup).toContainText('No bank on this network can lend against it again until it is released.');
});

test('duplicate demo is offered on a receipt that already has an active lien', async ({ page }) => {
  await signIn(page, `/collateral/${ENWR_ACTIVE}`);
  await expect(page.getByTestId('mark-lien')).toHaveCount(0);
  await page.getByTestId('duplicate-btn').click();
  await expect(page.getByTestId('double-financing').getByTestId('error-code')).toHaveText('ERR_DOUBLE_FINANCING');
  await expect(page.getByTestId('existing-lien-tx')).toContainText('FIXTURE-');
});

test('loans: list, repay, and the disburse and release paths (loan state stubbed; the mock keeps none)', async ({ page }) => {
  await signIn(page, '/loans');
  await expect(page.getByTestId('loan-table').locator('tbody tr')).toHaveCount(3);

  await page.goto('/loans/LN-2026-00041'); // DISBURSED in the fixtures
  await expect(page.getByTestId('disburse')).toBeDisabled();
  await expect(page.getByTestId('release')).toBeDisabled();
  await page.getByLabel('Amount (₹)').fill('5000');
  await page.getByTestId('repay').click();
  await expect(page.getByTestId('receipt')).toContainText('pledge-lien.recordRepayment');

  const base = { loanId: 'LN-2026-00041', enwr: ENWR_ACTIVE, amount: 11189, proofs: [], tenureDays: 180, ratePct: 9.5, repaidAmount: 0 };
  await stubLoan(page, { ...base, status: 'SANCTIONED' });
  await page.goto('/loans/LN-2026-00041');
  await page.getByTestId('disburse').click();
  await expect(page.getByTestId('receipt')).toContainText('pledge-lien.recordDisbursement');

  await page.unroute('http://localhost:4010/loans/LN-2026-00041');
  await stubLoan(page, { ...base, status: 'REPAID', repaidAmount: 11189 });
  await page.goto('/loans/LN-2026-00041');
  await page.getByTestId('release').click();
  const receipt = page.getByTestId('receipt');
  await expect(receipt).toContainText('pledge-lien.releaseLien');
  await expect(page.getByRole('link', { name: /Open this receipt in the FPO console/ })).toHaveAttribute('href', /\/collateral\/ENWR-NERL-2026-004212$/);
});

test('inbound routes render real content', async ({ page }) => {
  await signIn(page, `/collateral/${ENWR_ACTIVE}`);
  await expect(page.getByTestId('assessed')).not.toBeEmpty();
  await page.goto('/loans/LN-2026-00042');
  await expect(page.getByRole('heading', { name: 'LN-2026-00042' })).toBeVisible();
  await expect(page.getByTestId('loan-status')).toHaveText('Disbursed');
  await page.goto('/collateral/ENWR-NERL-2099-000000');
  await expect(page.getByText('No receipt with this e-NWR').first()).toBeVisible();
});

test('writes are disabled when the ledger is index-only', async ({ page }) => {
  // Every gateway response carries X-Ledger-Mode, so fake it on all of them, as the read-only API would.
  await page.route('http://localhost:4010/**', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'x-ledger-mode': 'index-only' } });
  });
  await signIn(page, `/collateral/${ENWR_FREE}`);
  await expect(page.getByTestId('offline-banner')).toBeVisible();
  await expect(page.getByTestId('mark-lien')).toBeDisabled();
  await expect(page.getByText('The ledger node is asleep. Actions that write to the ledger are paused.').first()).toBeVisible();
  await page.goto('/loans/LN-2026-00041');
  await expect(page.getByTestId('repay')).toBeDisabled();
});
