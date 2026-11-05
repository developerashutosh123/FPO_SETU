import { expect, test } from '@playwright/test';
import { ANIMA_PHONE, installFakeSpeech, LOT_CLOSED, LOT_DRAFT, LOT_PLEDGED, signIn, spoken, verifyWire } from './helpers';

test.describe('login and home', () => {
  test('first launch asks for a language, then phone and the demo OTP shown on screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lang-bn')).toBeVisible();
    await expect(page.getByTestId('lang-hi')).toBeVisible();
    await expect(page.getByTestId('lang-en')).toBeVisible();
    await page.getByTestId('lang-bn').click();
    await expect(page.getByTestId('phone-input')).toBeVisible();
    await page.getByTestId('phone-input').fill('12345');
    await page.getByTestId('send-otp').click();
    await expect(page.getByTestId('demo-otp')).toHaveCount(0); // bad phone is refused client side
    await page.getByTestId('phone-input').fill(ANIMA_PHONE);
    await page.getByTestId('send-otp').click();
    await expect(page.getByTestId('demo-otp')).toHaveText('123456');
    await page.getByTestId('otp-input').fill('000000');
    await page.getByTestId('verify-otp').click();
    await expect(page.getByTestId('login-error')).toBeVisible(); // wrong OTP
  });

  test('home shows the waiting card, the season summary and the settled lot with net credit', async ({ page }) => {
    await signIn(page);
    await expect(page.getByTestId('waiting-card')).toBeVisible();
    await expect(page.getByTestId('season-summary')).toContainText('₹25,921');
    const card = page.getByTestId(`lot-card-${LOT_CLOSED}`);
    await expect(card).toContainText('₹25,921');
    await expect(card).toContainText('আলু');
    await expect(page.getByTestId('footer').first()).toContainText('Academic prototype - RD61003');
    await expect(page.getByTestId('ledger-pill')).toContainText('1,284');
  });

  test('statement is two taps from home or fewer', async ({ page }) => {
    await signIn(page);
    await page.getByTestId(`open-statement-${LOT_CLOSED}`).click();
    await expect(page.getByTestId('net-amount')).toHaveText('₹25,921');
  });
});

test.describe('lot detail', () => {
  test('timeline, proof chips, drawer with endorsers and the consumer QR', async ({ page }) => {
    await signIn(page);
    await page.goto(`/lot/${LOT_CLOSED}`).catch(() => {});
    await expect(page.getByTestId('lot-header')).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00451');
    for (const k of ['commissioned', 'graded', 'stored', 'pledged', 'released', 'sold', 'dispatched', 'delivered', 'paid']) {
      await expect(page.getByTestId(`step-${k}`)).toBeVisible();
    }
    await expect(page.getByTestId('qr-card')).toBeVisible();
    await page.getByRole('button', { name: /^প্রমাণ FIXTURE-/ }).first().click();
    await expect(page.getByTestId('proof-drawer')).toBeVisible();
    await expect(page.getByTestId('proof-drawer')).toContainText('FpoOrgMSP'.replace('OrgMSP', '').replace('Fpo', 'FPO'));
    await expect(page.getByTestId('proof-txid')).toContainText('FIXTURE-');
  });

  test('a pledged lot says so in plain words', async ({ page }) => {
    await signIn(page);
    await page.goto(`/lot/${LOT_PLEDGED}`);
    await expect(page.getByTestId('pledged-card')).toBeVisible();
    await expect(page.getByTestId('pledged-card')).toContainText('ব্যাংকে বন্ধক');
  });

  test("someone else's lot is refused with an action-phrased message", async ({ page }) => {
    await signIn(page);
    await page.goto('/lot/089012340000004555');
    await expect(page.getByTestId('lot-error')).toContainText('আপনার লট নয়');
  });
});

test.describe('statement and read-aloud', () => {
  test('lines, deductions in Bengali, simulated UPI ref, and the amounts spoken in words', async ({ page }) => {
    await installFakeSpeech(page);
    await signIn(page);
    await page.goto(`/statement/${LOT_CLOSED}`);
    await expect(page.getByTestId('net-amount')).toHaveText('₹25,921');
    await expect(page.getByTestId('gross-amount')).toHaveText('₹31,031');
    for (const d of ['HAMALI', 'MARKET_FEE', 'COMMISSION', 'TRANSPORT', 'COLD_STORAGE_RENT', 'FPO_MARGIN']) await expect(page.getByTestId(`ded-${d}`)).toBeVisible();
    await expect(page.getByTestId('ded-COLD_STORAGE_RENT')).toHaveText('হিমঘরের ভাড়া');
    await expect(page.getByTestId('upi-ref')).toHaveText('SIM 604512339876');
    await page.getByTestId('read-aloud').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(9);
    const said = (await spoken(page)).join(' | ');
    expect(said).toContain('আপনি পেয়েছেন পঁচিশ হাজার নয় শো একুশ টাকা');
    expect(said).toContain('মোট বিক্রির টাকা একত্রিশ হাজার একত্রিশ টাকা');
    expect(said).toContain('হিমঘরের ভাড়া, তিন হাজার এক শো বিয়াল্লিশ টাকা');
    expect(said).toContain('তেরো নভেম্বর দুই হাজার ছাব্বিশ');
  });

  test('no Bengali voice: says so and keeps the text', async ({ page }) => {
    await installFakeSpeech(page, null);
    await signIn(page);
    await page.goto(`/statement/${LOT_CLOSED}`);
    await page.getByTestId('read-aloud').click();
    await expect(page.getByTestId('no-voice')).toContainText('বাংলা কণ্ঠ নেই');
    await expect(page.getByTestId('net-amount')).toBeVisible();
  });

  test('English switch reads the same statement in English words', async ({ page }) => {
    await installFakeSpeech(page, 'en-IN');
    await signIn(page, 'en');
    await page.goto(`/statement/${LOT_CLOSED}`);
    await page.getByTestId('read-aloud').click();
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(9);
    expect((await spoken(page)).join(' | ')).toContain('You received twenty-five thousand nine hundred and twenty-one rupees');
  });
});

test.describe('confirm lot with device signing (F2)', () => {
  test('signs payloadToSign exactly as received; the signature verifies against the registered public key', async ({ page }) => {
    let registeredKey = '';
    let signed: { url: string; signatureHex: string } | null = null;
    let payload = '';
    page.on('response', async (r) => { if (r.url().endsWith('/lots/drafts/pending') && r.ok()) payload = (await r.json())[0].payloadToSign; });
    page.on('request', (r) => {
      if (r.method() !== 'POST') return;
      if (r.url().endsWith('/farmers/me/device-key')) registeredKey = r.postDataJSON().publicKeyHex;
      if (r.url().includes('/farmer-sign')) signed = { url: r.url(), signatureHex: r.postDataJSON().signatureHex };
    });
    await signIn(page);
    await page.getByTestId(`confirm-${LOT_DRAFT}`).click();
    await expect(page.getByTestId('draft-card')).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00490');
    await expect(page.getByTestId('draft-card')).toContainText('40');
    await page.getByTestId('confirm-button').click();
    await expect(page.getByTestId('receipt')).toBeVisible();
    await expect(page.getByTestId('receipt-txid')).toContainText('FIXTURE-');

    expect(registeredKey).toMatch(/^04[0-9a-f]{128}$/);
    expect(signed).not.toBeNull();
    expect(signed!.url).toContain(`/lots/${LOT_DRAFT}/farmer-sign`);
    expect(payload).toContain('"sscc":"089012340000004906"');
    expect(verifyWire(registeredKey, payload, signed!.signatureHex)).toBe(true);
    expect(verifyWire(registeredKey, payload + ' ', signed!.signatureHex)).toBe(false); // really bound to those exact bytes
  });

  test('ERR_BAD_FARMER_SIGNATURE shows an action-phrased message with a re-register retry', async ({ page }) => {
    await page.route('**/farmer-sign', (route) => route.fulfill({ status: 422, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'x-ledger-mode': 'live' }, body: JSON.stringify({ error: { code: 'ERR_BAD_FARMER_SIGNATURE', message: 'x' } }) }));
    await signIn(page);
    await page.goto(`/confirm/${LOT_DRAFT}`);
    await page.getByTestId('confirm-button').click();
    await expect(page.getByTestId('confirm-error')).toContainText('সই খাতার চাবির সঙ্গে মিলল না');
    await expect(page.getByRole('button', { name: /আবার নথিভুক্ত/ })).toBeVisible();
  });

  test('"এটা ঠিক নয়" does not sign and takes the draft off the waiting list on this phone', async ({ page }) => {
    let signCalls = 0;
    page.on('request', (r) => { if (r.url().includes('/farmer-sign')) signCalls++; });
    await signIn(page);
    await page.getByTestId(`confirm-${LOT_DRAFT}`).click();
    await page.getByTestId('decline-button').click();
    await expect(page.getByTestId('declined-card')).toBeVisible();
    await page.goto('/home');
    await expect(page.getByTestId('waiting-card')).toHaveCount(0);
    expect(signCalls).toBe(0);
  });

  test('a draft that is not waiting says so', async ({ page }) => {
    await signIn(page);
    await page.goto('/confirm/089012340000004999');
    await expect(page.getByTestId('no-draft')).toBeVisible();
  });
});

test.describe('connectivity: inbound links and ledger mode', () => {
  test('/lot/{sscc} and /statement/{sscc} work signed out: sign in, then land on the page', async ({ page }) => {
    await page.goto(`/statement/${LOT_CLOSED}`);
    await page.getByTestId('lang-bn').click(); // first launch: language first, the link is remembered
    await expect(page.getByTestId('phone-input')).toBeVisible();
    await page.getByTestId('phone-input').fill(ANIMA_PHONE);
    await page.getByTestId('send-otp').click();
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await page.getByTestId('device-ok').click();
    await expect(page.getByTestId('net-amount')).toHaveText('₹25,921');
  });

  test('inbound routes render real content, not a 404 or an empty state', async ({ page }) => {
    await signIn(page);
    await page.goto(`/lot/${LOT_CLOSED}`);
    await expect(page.getByTestId('timeline')).toBeVisible();
    await page.goto(`/statement/${LOT_CLOSED}`);
    await expect(page.getByTestId('breakdown')).toBeVisible();
  });

  test('live update: a ledger event for my lot shows a toast within seconds (stream read with fetch, not EventSource)', async ({ page, request }) => {
    await signIn(page);
    await page.waitForTimeout(2600); // a fresh connection can replay history; only events after that count as news
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem('fposetu.farmer.session')!).token as string);
    const res = await request.post(`http://localhost:4010/lots/${LOT_DRAFT}/farmer-sign`, { headers: { authorization: `Bearer ${token}` }, data: { signatureHex: 'a'.repeat(128) } });
    expect(res.ok()).toBe(true);
    await expect(page.getByTestId('toast').first()).toContainText('WB-PSM-KGP2-POT-FPO07-2026-R-00451');
  });

  test('index-only mode: amber banner, confirm is disabled and says why', async ({ page }) => {
    await signIn(page);
    await page.route('http://localhost:4010/**', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), 'x-ledger-mode': 'index-only' } });
    });
    await page.goto(`/confirm/${LOT_DRAFT}`);
    await expect(page.getByTestId('offline-banner')).toContainText('লেজার নোড এখন ঘুমিয়ে আছে');
    await expect(page.getByTestId('paused-why')).toBeVisible();
    await expect(page.getByTestId('confirm-button')).toBeDisabled();
    await expect(page.getByTestId('ledger-pill')).toContainText('শুধু পড়া');
  });

});
