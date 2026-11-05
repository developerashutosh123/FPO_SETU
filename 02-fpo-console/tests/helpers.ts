import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://localhost:4010';
export const SSCC_PLEDGED = '089012340000004524'; // PLEDGED, lien ACTIVE, e-NWR ENWR-NERL-2026-004212
export const ENWR_PLEDGED = 'ENWR-NERL-2026-004212';
export const SSCC_SOLD = '089012340000004609'; // SOLD, no lien
export const SSCC_COMMISSIONED = '089012340000004807'; // brinjal, waiting to be weighed
export const ORDER_OPEN = 'ORD-2026-00091';
export const ORDER_DELIVERED = 'ORD-2026-00090';

export async function resetMock() {
  await fetch(`${MOCK}/__mock/reset`, { method: 'POST' });
}

export async function signIn(page: Page, username: 'sujata.ceo' | 'debasis.ops' | 'ratan.store' | 'subhankar.vle', next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: new RegExp(username.replace('.', '\\.')) }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname === next.split('?')[0]);
}

/** Signs in to the mock as the buyer and submits the buyer's side of the price agreement. Returns the response body. */
export async function buyerAgreesPrice(orderId: string, pricePerQtl: number) {
  const login = await fetch(`${MOCK}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'rahul.buyer', password: 'Setu@2026', portal: 'buyer' }) });
  const { token } = (await login.json()) as { token: string };
  const res = await fetch(`${MOCK}/orders/${orderId}/agree-price`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ pricePerQtl }) });
  return { status: res.status, body: (await res.json()) as { resource?: { priceHash: string; state: string }; error?: { code: string } } };
}
