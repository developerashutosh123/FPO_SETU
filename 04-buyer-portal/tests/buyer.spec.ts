import { expect, test } from '@playwright/test';
import { LOT_GRADED, LOT_IN_TRANSIT, LOT_PADDY, MOCK, ORDER_AGREED, ORDER_OPEN, fpoSubmitsPrice, resetMock, signIn, stubOrderPrice } from './helpers';

test.beforeEach(async () => { await resetMock(); });

test('catalogue shows only unpledged lots with trust chips, and filters by grade, commodity, quantity and variety', async ({ page }) => {
  await signIn(page);
  const cards = page.getByTestId('lot-card');
  await expect(cards).toHaveCount(2);
  const potato = page.locator(`[data-sscc="${LOT_GRADED}"]`);
  await expect(potato).toContainText('Grade B');
  await expect(potato).toContainText('Cold chain continuous');
  await expect(potato).toContainText('PHI compliant');
  await expect(potato).toContainText('Not residue tested');
  await expect(potato.getByTestId('lot-village')).toHaveText('Changual, Kharagpur-II');
  await expect(potato.getByTestId('lot-qty')).toContainText('2,480 kg');
  await expect(page.locator(`[data-sscc="${LOT_PADDY}"]`)).toContainText('Residue tested');
  // the pledged lot (…4524) never appears
  await expect(page.locator('[data-sscc="089012340000004524"]')).toHaveCount(0);

  await page.getByLabel('Grade').selectOption('A');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-sscc', LOT_PADDY);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(cards).toHaveCount(2);

  await page.getByLabel('Minimum quintals').fill('30');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();

  await page.getByLabel('Variety').fill('pukhraj');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-sscc', LOT_GRADED);
  await page.getByLabel('Variety').fill('nothing-like-this');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('No lot matches these filters')).toBeVisible();
});

test('lot spec sheet shows quality, compliance, custody, cold chain, documents and proofs; no diary, farmer name or bank link', async ({ page }) => {
  await signIn(page, `/lots/${LOT_IN_TRANSIT}`);
  await expect(page.getByTestId('lot-ref')).toContainText('WB-PSM-DBR-POT-FPO07-2026-R-00461');
  await expect(page.getByText('Device-verified')).toBeVisible();
  await expect(page.getByText('PHI compliant')).toBeVisible();
  await expect(page.getByText('The farmer\'s crop diary stays private')).toBeVisible();
  await expect(page.getByText('Residue tested')).toBeVisible();
  await expect(page.getByTestId('net-weight')).toContainText('3,430 kg');
  await expect(page.getByTestId('custody-chain')).toContainText('Kharagpur Krishak Sanghati Producer Company Ltd');
  await expect(page.getByTestId('custody-chain')).toContainText('awaiting acceptance by the buyer');
  // origin map: Leaflet with OSM attribution; Golgram is a block centroid and the page says so
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await expect(page.getByTestId('map-caption')).toContainText('block centre');
  // cold chain
  await expect(page.getByTestId('coldchain-summary')).toContainText('Continuous');
  await expect(page.getByTestId('digest-table').locator('tbody tr')).toHaveCount(1);
  // proofs: every one links to the Gov explorer
  const rows = page.getByTestId('proof-table').locator('tbody tr');
  await expect(rows).toHaveCount(11);
  await expect(rows.first().getByRole('link').first()).toHaveAttribute('href', /\/ledger\/tx\/FIXTURE-/);
  await rows.first().getByRole('button', { name: /Proof/ }).click();
  await expect(page.getByTestId('proof-drawer')).toContainText('trace-channel');
  await page.keyboard.press('Escape');
  // outbound links: consumer, gov, FPO console. Never bank or farmer.
  const links = await page.getByTestId('open-in').getByRole('link').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  expect(links.some((h) => /\/00\/089012340000004616$/.test(h))).toBe(true);
  expect(links.some((h) => /\/lots\/089012340000004616$/.test(h))).toBe(true);
  expect(links.some((h) => /localhost:3003|localhost:3001|bank|farmer/.test(h))).toBe(false);
  const text = (await page.locator('main').innerText()).toLowerCase();
  for (const banned of ['lien', 'loan', 'e-nwr', 'anima', 'phone']) expect(text).not.toContain(banned);
});

test('re-verify hashes the buyer\'s copy of a document in the browser and compares it with the ledger', async ({ page }) => {
  // The fixture hashes belong to no real file, so a real file is a mismatch. Serve the lot with one hash set to sha256("abc") for the match case.
  await signIn(page, `/lots/${LOT_IN_TRANSIT}`);
  const doc = page.getByTestId('doc').first();
  await doc.getByTestId('reverify-input').setInputFiles({ name: 'slip.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  const bad = doc.getByTestId('reverify-result');
  await expect(bad).toHaveAttribute('data-match', 'false');
  await expect(bad.getByTestId('computed-hash')).toHaveText('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  await page.route(`${MOCK}/lots/${LOT_IN_TRANSIT}`, async (route) => {
    const res = await route.fetch();
    const lot = await res.json();
    lot.integrity.docs[0].sha256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
    await route.fulfill({ response: res, json: lot });
  });
  await page.reload();
  const doc2 = page.getByTestId('doc').first();
  await doc2.getByTestId('reverify-input').setInputFiles({ name: 'slip.txt', mimeType: 'text/plain', buffer: Buffer.from('abc') });
  await expect(doc2.getByTestId('reverify-result')).toHaveAttribute('data-match', 'true');
});

test('golden step 7: select a lot, create an order, then the FPO submits first and the matching price commits with FPO and Buyer endorsers', async ({ page }) => {
  await signIn(page);
  await page.locator(`[data-sscc="${LOT_GRADED}"]`).getByLabel(/Add .* to an order/).check();
  await page.getByTestId('start-order').click();
  await expect(page).toHaveURL(/\/orders\/new\?sscc=/);
  await expect(page.getByTestId('order-lots')).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00453');
  await page.getByLabel('Deliver by').fill('2030-01-15');
  await page.getByTestId('create-order').click();
  const created = page.getByTestId('order-created');
  await expect(created.getByTestId('endorsers')).toContainText('FpoOrgMSP');
  await expect(created.getByTestId('endorsers')).toContainText('BuyerOrgMSP');
  await created.getByTestId('open-order').click();
  await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_OPEN}$`)); // the mock always answers createOrder with this fixture order

  await expect(page.getByTestId('sealed-copy')).toHaveText('Only you and the FPO can read this price. The shared ledger stores only this hash; the bank and the regulator see the hash, not the price.');
  expect((await fpoSubmitsPrice(ORDER_OPEN, 1500)).status).toBe(200);
  // after the FPO commit the mock serves no price for this order, so serve one in its fixture shape
  await stubOrderPrice(page, ORDER_OPEN, { orderId: ORDER_OPEN, pricePerQtl: 1500, salt: 'x', priceHash: 'h', quantityQtl: 21.9, totalAmount: 32850, agreedAt: '2026-11-14T10:00:00Z', proof: { txId: 'FIXTURE-41ab81ad3783', blockNumber: 201, channel: 'trade-channel' } });
  await page.getByLabel('Your price per quintal (₹)').fill('1500');
  await page.getByTestId('seal-price').click();
  const agreed = page.getByTestId('price-agreed');
  await expect(agreed).toBeVisible();
  await expect(agreed.getByTestId('price-value')).toHaveText('₹1,500');
  await expect(agreed.getByTestId('price-hash')).toContainText(/[0-9a-f]{64}/);
  const receipt = agreed.getByTestId('receipt');
  await expect(receipt.getByTestId('endorsers')).toContainText('FpoOrgMSP');
  await expect(receipt.getByTestId('endorsers')).toContainText('BuyerOrgMSP');
  await expect(agreed.getByTestId('agreed-endorsers')).toContainText('BuyerOrgMSP');
  await expect(receipt.getByRole('link', { name: /FIXTURE-/ }).first()).toHaveAttribute('href', /\/ledger\/tx\/FIXTURE-/);
});

test('buyer submits first: the sealed hash is shown, then the FPO-side commit appears live from the event stream', async ({ page }) => {
  await signIn(page, `/orders/${ORDER_OPEN}`);
  await page.getByLabel('Your price per quintal (₹)').fill('1500');
  await page.getByTestId('seal-price').click();
  const waiting = page.getByTestId('price-waiting');
  await expect(waiting).toContainText('Waiting for the FPO');
  await expect(waiting.getByTestId('price-hash')).toContainText(/[0-9a-f]{64}/);
  await expect(page.getByTestId('price-steps')).toHaveAttribute('data-stage', 'waiting');
  await expect(waiting.getByTestId('fpo-side')).toContainText('Nothing from the FPO yet');
  await fpoSubmitsPrice(ORDER_OPEN, 1500);
  await expect(waiting.getByTestId('fpo-event').first()).toContainText('FPO price step committed', { timeout: 10_000 });
});

test('negative case: a price hash mismatch is shown as ERR_PRICE_HASH_MISMATCH and nothing is committed', async ({ page }) => {
  await signIn(page, `/orders/${ORDER_OPEN}`);
  await fpoSubmitsPrice(ORDER_OPEN, 1500);
  await page.getByLabel('Your price per quintal (₹)').fill('1400');
  await page.getByTestId('seal-price').click();
  const mismatch = page.getByTestId('price-mismatch');
  await expect(mismatch.getByTestId('error-code')).toHaveText('ERR_PRICE_HASH_MISMATCH');
  await expect(mismatch.getByTestId('error-message')).toContainText('do not match');
  await expect(mismatch).toContainText('Nothing was committed');
  await expect(page.getByTestId('price-agreed')).toHaveCount(0);
  // and the buyer can start again
  await page.getByTestId('price-again').click();
  await expect(page.getByTestId('price-mismatch')).toHaveCount(0);
  await expect(page.getByTestId('seal-price')).toBeVisible();
});

test('an order whose price is already agreed shows the price from the private collection and the endorsers of the commit', async ({ page }) => {
  await signIn(page, `/orders/${ORDER_AGREED}`);
  const agreed = page.getByTestId('price-agreed');
  await expect(agreed.getByTestId('price-value')).toHaveText('₹1,575');
  await expect(agreed.getByTestId('price-total')).toHaveText('₹62,370');
  await expect(agreed.getByTestId('agreed-endorsers')).toContainText('FpoOrgMSP');
  await expect(agreed.getByTestId('agreed-endorsers')).toContainText('BuyerOrgMSP');
  await expect(agreed.getByTestId('price-hash')).toContainText('6756b8cf73caa51e716240609620fd6e3a7874961b28c859fae0c0962f5a2436');
  await expect(page.getByTestId('price-form')).toHaveCount(0);
});

test('orders list shows hashes and no prices', async ({ page }) => {
  await signIn(page, '/orders');
  await expect(page.getByTestId('order-row')).toHaveCount(6);
  const text = await page.getByTestId('order-table').innerText();
  expect(text).not.toMatch(/₹/);
});

test('index-only mode: the banner shows and every write button is disabled', async ({ page }) => {
  await page.route(`${MOCK}/**`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), 'x-ledger-mode': 'index-only' } });
  });
  await signIn(page, `/orders/${ORDER_OPEN}`);
  await expect(page.getByTestId('offline-banner')).toContainText('The ledger node is asleep');
  await expect(page.getByTestId('ledger-pill')).toContainText('Index-only');
  await page.getByLabel('Your price per quintal (₹)').fill('1500');
  await expect(page.getByTestId('seal-price')).toBeDisabled();
});
