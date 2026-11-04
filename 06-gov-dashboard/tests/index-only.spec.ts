import { expect, test } from '@playwright/test';
import { SEED, signIn } from './helpers';

// Run by hand: needs the primary gateway dead and a read-only copy answering (see docs/TESTING.md). Skipped otherwise.
test.skip(!process.env.INDEX_ONLY_E2E, 'set INDEX_ONLY_E2E=1 with NEXT_PUBLIC_MOCK_URL pointing at a dead port and NEXT_PUBLIC_READ_API_URL at `mock --index-only`');

test('falls back to the read-only copy: banner, amber pill, tx note, polling line', async ({ page }) => {
  await page.goto(`/ledger/tx/${SEED.tx}`);
  await expect(page.getByTestId('index-only-note')).toHaveText('Served from the indexed copy of the ledger; live peer is offline.');
  await page.goto('/ledger');
  await expect(page.getByTestId('offline-banner')).toContainText('The ledger node is asleep.');
  await expect(page.getByTestId('ledger-pill')).toContainText('Index-only · last block #1,284 at');
  await expect(page.getByTestId('live-line')).toContainText('refreshes every 30 seconds');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await signIn(page, 'observer.gov'); // sign-in still works in index-only mode
  await page.goto('/network');
  await expect(page.getByTestId('status-note')).toContainText('last indexed chain state');
});
