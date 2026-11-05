import { expect, test } from '@playwright/test';
import { LOT_IN_TRANSIT, MOCK, ORDER_IN_TRANSIT, resetMock, signIn } from './helpers';

test.beforeEach(async () => { await resetMock(); });

test('golden step 8: look up the lot by SSCC, accept custody, then accept quality', async ({ page }) => {
  await signIn(page, '/receive');
  await page.getByLabel('SSCC from the label').fill(LOT_IN_TRANSIT);
  await page.getByTestId('lookup').click();
  await expect(page.getByTestId('receive-ref')).toContainText('WB-PSM-DBR-POT-FPO07-2026-R-00461');
  await expect(page.getByTestId('lot-status')).toHaveText('In transit');
  await expect(page.getByTestId('hop')).toContainText('Kharagpur Krishak Sanghati Producer Company Ltd to Gangetic Fresh Foods Pvt Ltd');
  await expect(page.getByTestId('why-buyer-signs')).toContainText('your own organisation signs');
  await expect(page.getByTestId('accept-quality')).toHaveCount(0);

  await page.getByTestId('accept-custody').click();
  await expect(page.getByTestId('custody-done')).toBeVisible();
  const custody = page.getByTestId('receipt').first();
  await expect(custody.getByTestId('endorsers')).toContainText('BuyerOrgMSP');
  await expect(custody).toContainText('lot-lifecycle.acceptTransfer');
  await expect(custody.getByRole('link', { name: /FIXTURE-/ }).first()).toHaveAttribute('href', /\/ledger\/tx\/FIXTURE-/);

  await page.getByLabel('Notes for the FPO (optional)').fill('Crates intact');
  await page.getByTestId('accept-quality').click();
  await expect(page.getByTestId('quality-done')).toContainText(ORDER_IN_TRANSIT);
  const receipts = page.getByTestId('receipt');
  await expect(receipts).toHaveCount(2);
  await expect(receipts.nth(1)).toContainText('order-settlement.acceptQuality');
  await expect(receipts.nth(1).getByTestId('endorsers')).toContainText('FpoOrgMSP');
});

test('the QR scan path resolves a GS1 Digital Link from the label to the lot (BarcodeDetector stubbed)', async ({ page }) => {
  await page.addInitScript((url) => {
    // A fake camera and detector: the test proves the wiring from decoded text to the lot, not a real camera.
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48; const ctx = canvas.getContext('2d')!;
    setInterval(() => { ctx.fillStyle = `hsl(${Date.now() % 360} 50% 50%)`; ctx.fillRect(0, 0, 64, 48); }, 100); // a stream only produces frames while the canvas changes
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(5);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class { async detect() { return [{ rawValue: url }]; } };
  }, `http://localhost:3005/00/${LOT_IN_TRANSIT}`);
  await signIn(page, '/receive');
  await page.getByTestId('start-scan').click();
  await expect(page.getByTestId('scanner')).toHaveAttribute('data-engine', 'native');
  await expect(page.getByTestId('receive-ref')).toContainText('00461', { timeout: 10_000 });
  await expect(page.getByTestId('scanner')).toHaveCount(0); // the camera stops once a lot is found
});

test('a QR that is not a lot label is explained, not sent to the API', async ({ page }) => {
  await signIn(page, '/receive');
  await page.getByLabel('SSCC from the label').fill('089012340000004618'); // wrong check digit
  await page.getByTestId('lookup').click();
  await expect(page.getByTestId('scan-note')).toContainText('not a lot label');
  await expect(page.getByTestId('receive-ref')).toHaveCount(0);
});

test('a lot that is not in transit cannot be received', async ({ page }) => {
  await signIn(page, '/receive?sscc=089012340000004531');
  await expect(page.getByText('This lot is not in transit to you')).toBeVisible();
  await expect(page.getByTestId('accept-custody')).toHaveCount(0);
});

test('negative case: the demo button tries to accept as the FPO and the ledger refuses; the lot stays in transit', async ({ page }) => {
  await signIn(page, `/receive?sscc=${LOT_IN_TRANSIT}`);
  await page.getByTestId('try-fpo').click();
  const refused = page.getByTestId('fpo-refused');
  await expect(refused).toContainText('Refused, as it should be.');
  // The mock enforces roles, so an FPO token is stopped at the role check (the real gateway does the same, see CONTRACT_REQUESTS.md).
  await expect(refused.getByTestId('fpo-error-code')).toHaveText('ERR_FORBIDDEN_ROLE');
  await expect(refused).toContainText('In transit');
  await expect(page.getByTestId('custody-done')).toHaveCount(0);
  await expect(page.getByTestId('accept-custody')).toBeEnabled(); // the buyer can still accept
});

test('negative case: when the chaincode refuses the FPO, the page shows ERR_UNILATERAL_CUSTODY as returned', async ({ page }) => {
  // The mock checks roles before anything else, so an FPO token never reaches the chaincode rule. Serve the chaincode's refusal in the
  // gateway's error shape for the FPO's call only, to prove the page renders the code and message as returned. Run against the real gateway in P5.
  await page.route(`${MOCK}/lots/*/custody/accept`, async (route) => {
    const token = (route.request().headers().authorization ?? '').split(' ')[1] ?? '';
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}') as { role?: string };
    if (claims.role !== 'operator') return route.fallback();
    return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'x-ledger-mode': 'live' },
      body: JSON.stringify({ error: { code: 'ERR_UNILATERAL_CUSTODY', message: 'ERR_UNILATERAL_CUSTODY: only BuyerOrgMSP, named in the proposal, may accept this transfer.' } }) });
  });
  await signIn(page, `/receive?sscc=${LOT_IN_TRANSIT}`);
  await page.getByTestId('try-fpo').click();
  const refused = page.getByTestId('fpo-refused');
  await expect(refused.getByTestId('fpo-error-code')).toHaveText('ERR_UNILATERAL_CUSTODY');
  await expect(refused.getByTestId('fpo-error-message')).toContainText('only BuyerOrgMSP');
  await expect(refused).toContainText('In transit');
});
