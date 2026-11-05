import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://localhost:4010';
/** Seeded in shared/fixtures. */
export const LOT_GRADED = '089012340000004531'; // catalogue, grade B potato, Changual
export const LOT_PADDY = '089012340000004715'; // catalogue, grade A paddy, Gopalpur
export const LOT_IN_TRANSIT = '089012340000004616'; // IN_TRANSIT to the buyer, Golgram (BLOCK_CENTROID village), order ORD-2026-00089
export const LOT_DELIVERED = '089012340000004623';
export const ORDER_OPEN = 'ORD-2026-00091'; // status OPEN: the only order that accepts agree-price in the mock
export const ORDER_AGREED = 'ORD-2026-00088'; // status PRICE_AGREED, price in tradePricePDC fixture
export const ORDER_IN_TRANSIT = 'ORD-2026-00089';

export async function resetMock() {
  await fetch(`${MOCK}/__mock/reset`, { method: 'POST' });
}

export async function signIn(page: Page, next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: /rahul\.buyer/ }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL((u) => u.pathname + u.search === next || u.pathname === next.split('?')[0]);
}

/** The FPO side of the price agreement, played straight against the mock gateway (portal 02 is not part of this folder). */
export async function fpoSubmitsPrice(orderId: string, pricePerQtl: number): Promise<Response> {
  const login = await fetch(`${MOCK}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'sujata.ceo', password: 'Setu@2026', portal: 'fpo' }) });
  const { token } = (await login.json()) as { token: string };
  return fetch(`${MOCK}/orders/${orderId}/agree-price`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ pricePerQtl }) });
}

/** The mock serves GET /orders/:id/price only for orders that already have a price in the fixtures. */
export async function stubOrderPrice(page: Page, orderId: string, body: Record<string, unknown>) {
  await page.route(`${MOCK}/orders/${orderId}/price`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'x-ledger-mode': 'live' }, body: JSON.stringify(body) }));
}
