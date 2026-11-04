import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://localhost:4010';
export const ENWR_ACTIVE = 'ENWR-NERL-2026-004212'; // lien ACTIVE in the fixtures
export const ENWR_FREE = 'ENWR-CCRL-2026-000119'; // lot IN_STORAGE, no lien

export async function resetMock() {
  await fetch(`${MOCK}/__mock/reset`, { method: 'POST' });
}

export async function signIn(page: Page, next = '/collateral') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByRole('button', { name: /arindam\.bank/ }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/\//g, '\\/')));
}

/** Serves a fixed loan for GET /loans/:id. The mock has no loan state, so status-dependent buttons need a stubbed read. */
export async function stubLoan(page: Page, loan: Record<string, unknown>) {
  await page.route(`${MOCK}/loans/${loan.loanId as string}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'x-ledger-mode': 'live' }, body: JSON.stringify(loan) });
  });
}
