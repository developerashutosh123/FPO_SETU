import { test } from '@playwright/test';
import { installFakeSpeech, LOT_CLOSED, LOT_DRAFT, LOT_PLEDGED, signIn } from './helpers';

// Not part of `pnpm e2e`: run with SHOTS=1 to refresh docs/screenshots.
test.skip(!process.env.SHOTS, 'set SHOTS=1');
const sizes = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 900 } } as const;

for (const [name, vp] of Object.entries(sizes)) {
  test(`screenshots ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await installFakeSpeech(page);
    const shot = (n: string) => page.waitForTimeout(500).then(() => page.screenshot({ path: `docs/screenshots/${name}-${n}.png` }));
    await page.goto('/');
    await shot('01-language');
    await page.getByTestId('lang-bn').click();
    await shot('02-login');
    await page.getByTestId('phone-input').fill('9000000001');
    await page.getByTestId('send-otp').click();
    await page.getByTestId('demo-otp').waitFor();
    await shot('03-login-otp');
    await page.getByTestId('otp-input').fill('123456');
    await page.getByTestId('verify-otp').click();
    await shot('04-device-key');
    await page.getByTestId('device-ok').click();
    await page.getByTestId('season-summary').waitFor();
    await shot('05-home');
    await page.goto(`/lot/${LOT_CLOSED}`); await page.getByTestId('timeline').waitFor(); await shot('06-lot-settled');
    await page.goto(`/lot/${LOT_PLEDGED}`); await page.getByTestId('pledged-card').waitFor(); await shot('07-lot-pledged');
    await page.goto(`/confirm/${LOT_DRAFT}`); await page.getByTestId('confirm-button').waitFor(); await shot('08-confirm');
    await page.getByTestId('confirm-button').click(); await page.getByTestId('receipt').waitFor(); await shot('09-confirmed-receipt');
    await page.goto(`/statement/${LOT_CLOSED}`); await page.getByTestId('breakdown').waitFor(); await shot('10-statement');
    await page.getByTestId('read-aloud').click(); await page.waitForTimeout(40); await shot('11-statement-reading');
  });
}
