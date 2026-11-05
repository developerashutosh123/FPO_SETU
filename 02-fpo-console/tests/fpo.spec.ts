import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { canonicalJson } from '../src/contract/contract';
import { buyerAgreesPrice, ENWR_PLEDGED, MOCK, ORDER_DELIVERED, ORDER_OPEN, resetMock, signIn, SSCC_COMMISSIONED, SSCC_PLEDGED, SSCC_SOLD } from './helpers';

test.beforeEach(async () => { await resetMock(); });

test('Today shows the three counters, the queue by status and the exceptions panel; every row links to its lot', async ({ page }) => {
  await signIn(page, 'sujata.ceo');
  await expect(page.getByTestId('counter-drafts')).toContainText('Drafts waiting for the farmer');
  await expect(page.getByTestId('counter-pledged')).toContainText('Pledged lots');
  await expect(page.getByTestId('queue-SOLD')).toBeVisible();
  await expect(page.getByTestId('exceptions')).toBeVisible();
  await expect(page.getByTestId('exceptions')).toContainText(/active lot passports/);
  await page.getByTestId('queue-PLEDGED').getByRole('link', { name: /WB-PSM-KGP2-POT/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lots/${SSCC_PLEDGED}`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00452');
});

test('Lots: filter by status and search by reference', async ({ page }) => {
  await signIn(page, 'ratan.store', '/lots');
  const rows = page.getByTestId('lots-table').locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  const all = await rows.count();
  await page.getByLabel('Status').selectOption('SOLD');
  expect(await rows.count()).toBeLessThan(all);
  await expect(rows.first()).toContainText('sold');
  await page.getByLabel('Status').selectOption('');
  await page.keyboard.press('/');
  await expect(page.getByLabel('Search')).toBeFocused();
  await page.getByLabel('Search').fill('R-00455');
  await expect(rows).toHaveCount(1);
});

test('step 4: weigh with W, read the meter with Q, confirm the grade with G, then print the label with P', async ({ page }) => {
  // the mock always answers the quality meter with a potato reading; the brinjal lot needs a vegetable one
  await page.route(`${MOCK}/devices/QM-CHG-01/read`, async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    await route.fulfill({ response: res, json: { ...body, reading: { deviceId: 'QM-CHG-01', at: body.reading.at, vegetable: { uniformityPct: 94, damagePct: 3 } } } });
  });
  await signIn(page, 'debasis.ops', `/intake?sscc=${SSCC_COMMISSIONED}`);
  await expect(page.getByTestId('station-lot')).toContainText('WB-PSM-KGP2-BRJ');
  await expect(page.getByTestId('waiting-list')).toContainText('waiting for farmer signature');
  await page.keyboard.press('w');
  await expect(page.getByTestId('wb-reading')).toContainText('1,964 kg');
  await expect(page.getByTestId('wb-reading')).toContainText('Simulated device');
  await page.keyboard.press('q');
  await expect(page.getByTestId('grade-proposal')).toContainText('Proposed grade');
  await expect(page.getByTestId('grade-proposal')).toContainText('Rule used');
  await expect(page.getByTestId('grade-proposal').getByText('Grade A').first()).toBeVisible();
  await page.keyboard.press('g');
  const receipt = page.getByTestId('grade-receipt');
  await expect(receipt).toContainText('Committed to the ledger');
  await expect(receipt).toContainText('attestQuality');
  await expect(receipt.getByRole('link', { name: /FIXTURE-/ })).toHaveAttribute('href', /\/ledger\/tx\/FIXTURE-/);
  await page.keyboard.press('p');
  await expect(page.getByTestId('label-link')).toBeVisible();
});

test('step 4 negative: a CEO is not offered Intake and gets a plain message on the URL', async ({ page }) => {
  await signIn(page, 'sujata.ceo');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Intake' })).toHaveCount(0);
  await page.goto('/intake');
  await expect(page.getByText('This page is not part of your role')).toBeVisible();
});

test('step 7: the FPO side of the price agreement hashes to the same value as the buyer', async ({ page }) => {
  await signIn(page, 'sujata.ceo', `/orders/${ORDER_OPEN}`);
  await page.getByLabel('Price per quintal (₹)').fill('1,580');
  const req = page.waitForRequest((r) => r.url().endsWith(`/orders/${ORDER_OPEN}/agree-price`) && r.method() === 'POST');
  await page.getByTestId('agree-submit').click();
  expect((await req).postDataJSON()).toEqual({ pricePerQtl: 1580 }); // no salt: the gateway derives the same one for both parties
  const sent = page.getByTestId('agree-sent');
  await expect(sent).toContainText('The price goes only to you and the buyer. The shared ledger stores this hash:');
  await expect(page.getByTestId('buyer-side')).toContainText('Waiting for Gangetic Fresh Foods');
  const shown = (await sent.locator('.mono').filter({ hasText: /^[0-9a-f]{64}$/ }).first().textContent())!;
  const expected = createHash('sha256').update(canonicalJson({ orderId: ORDER_OPEN, pricePerQtl: 1580, salt: createHash('sha256').update(ORDER_OPEN).digest('hex').slice(0, 32) })).digest('hex');
  expect(shown).toBe(expected);
  // the buyer submits the same number independently: the ledger commits the agreement with the same hash
  const buyer = await buyerAgreesPrice(ORDER_OPEN, 1580);
  expect(buyer.body.resource).toMatchObject({ state: 'AGREED', priceHash: shown });
});

test('step 7 negative: a different buyer price is rejected with ERR_PRICE_HASH_MISMATCH', async ({ page }) => {
  expect((await buyerAgreesPrice(ORDER_OPEN, 1600)).body.resource?.state).toBe('AWAITING_COUNTERPARTY');
  await signIn(page, 'sujata.ceo', `/orders/${ORDER_OPEN}`);
  await page.getByLabel('Price per quintal (₹)').fill('1580');
  await page.getByTestId('agree-submit').click();
  await expect(page.getByTestId('agree-error')).toContainText('The prices do not match');
  await expect(page.getByTestId('agree-sent')).toHaveCount(0);
});

test('the price field rejects what the gateway would refuse', async ({ page }) => {
  await signIn(page, 'sujata.ceo', `/orders/${ORDER_OPEN}`);
  await page.getByLabel('Price per quintal (₹)').fill('15x80');
  await expect(page.getByText('Use digits only')).toBeVisible();
  await expect(page.getByTestId('agree-submit')).toBeDisabled();
});

test('step 8: dispatch a sold lot with a vehicle and a simulated logger', async ({ page }) => {
  await signIn(page, 'debasis.ops', `/lots/${SSCC_SOLD}`);
  await page.getByLabel('Vehicle number').fill('WB-30-AB-1234');
  await page.getByLabel(/Temperature logger ID/).fill('BLE-SIM-0042');
  const req = page.waitForRequest((r) => r.url().endsWith(`/lots/${SSCC_SOLD}/custody/propose`));
  await page.getByTestId('dispatch-submit').click();
  expect((await req).postDataJSON()).toEqual({ toOrg: 'BuyerOrgMSP', vehicleNo: 'WB-30-AB-1234', loggerId: 'BLE-SIM-0042' });
  await expect(page.getByTestId('receipt')).toContainText('proposeTransfer');
});

test('step 8 negative: dispatching a pledged lot shows ERR_LOT_PLEDGED and a link to release the lien in the bank portal', async ({ page }) => {
  // the mock does not model liens on custody, so the refusal the chaincode would give is forced
  await page.route(`${MOCK}/lots/${SSCC_PLEDGED}/custody/propose`, (route) => route.continue({ headers: { ...route.request().headers(), 'x-mock-error': 'ERR_LOT_PLEDGED' } }));
  await signIn(page, 'debasis.ops', `/lots/${SSCC_PLEDGED}`);
  await expect(page.getByTestId('pledged-notice')).toContainText('LIEN-2026-00041');
  await page.getByLabel('Vehicle number').fill('WB-30-AB-1234');
  await page.getByLabel(/Temperature logger ID/).fill('BLE-SIM-0042');
  await page.getByTestId('dispatch-submit').click();
  const err = page.getByTestId('dispatch-error');
  await expect(err).toContainText('ERR_LOT_PLEDGED');
  await expect(page.getByTestId('release-link')).toHaveAttribute('href', new RegExp(`/collateral/${ENWR_PLEDGED}$`));
});

test('dispatch is not offered before the lot is sold', async ({ page }) => {
  await signIn(page, 'debasis.ops', '/lots/089012340000004531');
  await expect(page.getByTestId('dispatch-unavailable')).toBeVisible();
});

test('step 9: record the settlement of a delivered order with a simulated UPI reference', async ({ page }) => {
  await signIn(page, 'sujata.ceo', `/orders/${ORDER_DELIVERED}`);
  await page.getByLabel(/UPI reference/).fill('6045123');
  await expect(page.getByText('A UPI reference is 12 digits')).toBeVisible();
  await page.getByLabel(/UPI reference/).fill('604512339876');
  const req = page.waitForRequest((r) => r.url().endsWith(`/orders/${ORDER_DELIVERED}/settle`));
  await page.getByRole('button', { name: 'Record settlement' }).click();
  expect((await req).postDataJSON()).toEqual({ amount: 48984, upiRef: '604512339876' });
  await expect(page.getByTestId('receipt')).toContainText('recordSettlement');
});

test('Orders: the list shows hashes and never a price; ONDC and e-NAM are labelled simulated', async ({ page }) => {
  await signIn(page, 'sujata.ceo', '/orders');
  const table = page.getByTestId('orders-table');
  await expect(table.locator('tbody tr').first()).toBeVisible();
  await expect(table).not.toContainText('₹');
  await page.getByLabel('Channel').selectOption('ONDC');
  await expect(page.getByLabel('Channel')).toContainText('simulated adapter');
});

test('Collateral: the CEO sees the lien, loan terms and a link to the bank view', async ({ page }) => {
  await signIn(page, 'sujata.ceo', `/collateral/${ENWR_PLEDGED}`);
  await expect(page.getByTestId('valuation')).toContainText('Haircut');
  await expect(page.getByTestId('loan')).toContainText('LN-2026-00041');
  await expect(page.getByTestId('loan')).toContainText('Outstanding');
  await expect(page.getByRole('link', { name: /bank's view/ })).toHaveAttribute('href', new RegExp(`/collateral/${ENWR_PLEDGED}$`));
});
