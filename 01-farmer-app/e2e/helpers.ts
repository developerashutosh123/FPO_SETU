import { expect, type Page } from '@playwright/test';
import { createPublicKey, verify } from 'node:crypto';

export const ANIMA_PHONE = '9000000001';
export const LOT_CLOSED = '089012340000004517'; // settled, has the seeded statement
export const LOT_PLEDGED = '089012340000004524'; // lien ACTIVE
export const LOT_DRAFT = '089012340000004906'; // waiting for Anima's signature

/**
 * A fake speechSynthesis, so the read-aloud can be captured in a headless browser. `langs`: the voices the device has (none = null).
 * `delayMs`: the voice list is empty until then, and a `voiceschanged` event fires when it fills (how real browsers load voices).
 */
export async function installFakeSpeech(page: Page, langs: string | string[] | null = 'bn-IN', delayMs = 0) {
  await page.addInitScript(([voiceLangs, delay]) => {
    const w = window as unknown as Record<string, unknown>;
    w.__spoken = [] as string[];
    w.__spokenVoice = [] as string[];
    const all = (voiceLangs as string[]).map((l) => ({ name: `Test ${l}`, lang: l, voiceURI: `test-${l}`, default: false, localService: true }));
    let voices = delay ? [] : all;
    const target = new EventTarget();
    if (delay) setTimeout(() => { voices = all; target.dispatchEvent(new Event('voiceschanged')); }, delay as number);
    w.SpeechSynthesisUtterance = function () { /* the caller sets text, lang, voice and the callbacks */ };
    // window.speechSynthesis is an accessor on the prototype chain: assigning does nothing, so define it
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak: (u: { text: string; voice?: { lang: string }; onend?: () => void }) => { (w.__spoken as string[]).push(u.text); (w.__spokenVoice as string[]).push(u.voice?.lang ?? ''); setTimeout(() => u.onend?.(), 5); },
        cancel: () => {}, pause: () => {}, resume: () => {}, speaking: false, pending: false, paused: false,
        addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target),
      },
    });
  }, [langs === null ? [] : Array.isArray(langs) ? langs : [langs], delayMs] as const);
}
export const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
export const spokenVoices = (page: Page) => page.evaluate(() => (window as unknown as { __spokenVoice: string[] }).__spokenVoice);

/** Language tile, phone, demo OTP, device-key intro, then home. */
export async function signIn(page: Page, lang: 'bn' | 'hi' | 'en' = 'bn') {
  await page.goto('/');
  await page.getByTestId(`lang-${lang}`).click();
  await page.getByTestId('phone-input').fill(ANIMA_PHONE);
  await page.getByTestId('send-otp').click();
  await expect(page.getByTestId('demo-otp')).toHaveText('123456');
  await page.getByTestId('otp-input').fill('123456');
  await page.getByTestId('verify-otp').click();
  await page.getByTestId('device-ok').click();
  await expect(page.getByTestId('season-summary')).toBeVisible();
}

/** Verifies an ECDSA P-256 / SHA-256 signature in the wire format of CONTRACT.md section 7 (r||s hex, uncompressed SEC1 public key hex). */
export function verifyWire(publicKeyHex: string, message: string, signatureHex: string): boolean {
  if (!/^04[0-9a-f]{128}$/.test(publicKeyHex) || !/^[0-9a-f]{128}$/.test(signatureHex)) return false;
  const b64u = (h: string) => Buffer.from(h, 'hex').toString('base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(publicKeyHex.slice(2, 66)), y: b64u(publicKeyHex.slice(66)) }, format: 'jwk' });
  return verify('sha256', Buffer.from(message, 'utf8'), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signatureHex, 'hex'));
}
