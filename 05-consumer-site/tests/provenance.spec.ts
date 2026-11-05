import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Fixture IDs come from shared/fixtures (the mock gateway on :4010 serves them).
const SETTLED = '089012340000004517';
const BREACH = '089012340000004623';   // Golgram, one cold-chain breach
const NO_PHI = '089012340000004807';   // brinjal, phiCompliant=false, no grade, no residue claim to make
const UNKNOWN = '089012340000004000';  // valid check digit, no record

const fixtures = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', 'shared', 'fixtures', f), 'utf8')) as { examples: { endpoint: string; params?: { sscc?: string }; body: any }[] };
const provenance = fixtures('provenance.json').examples.filter((e) => e.endpoint === 'publicProvenance');

test('settled lot: hero, three checks, journey, ledger links', async ({ page }) => {
  await page.goto(`/00/${SETTLED}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Potato');
  await expect(page.getByText('Kufri Jyoti')).toBeVisible();
  await expect(page.getByText('Grown in Changual, Kharagpur-II block, Paschim Medinipur')).toBeVisible();
  await expect(page.getByText('Harvested or unloaded on 02-11-2026')).toBeVisible();
  await expect(page.getByText('Residue tested', { exact: true })).toBeVisible();
  await expect(page.getByText('Safe-to-harvest interval respected')).toBeVisible();
  await expect(page.getByText('Kept cool all the way')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'The journey' })).toBeVisible();
  await expect(page.locator('ol li')).toHaveCount(5);
  // "how we know" opens
  const first = page.locator('details').first();
  await first.locator('summary').click();
  await expect(first.getByText(/recorded on the ledger/)).toBeVisible();
  // verify expander lists tx links into the Gov explorer
  await page.getByRole('heading', { name: 'Verify it yourself' }).click();
  const links = page.locator('a[href*="/ledger/tx/"]');
  expect(await links.count()).toBeGreaterThan(0);
  await expect(page.getByText('index-only', { exact: false })).toHaveCount(0);
});

test('lot with a breach says so honestly', async ({ page }) => {
  await page.goto(`/00/${BREACH}`);
  await expect(page.getByText('Not kept cool all the way')).toBeVisible();
  await expect(page.getByText('Kept cool all the way', { exact: true })).toHaveCount(0);
  await page.locator('details').nth(2).locator('summary').click();
  await expect(page.getByText('Breaches recorded: 1')).toBeVisible();
});

test('lot without a confirmed safe interval does not claim it', async ({ page }) => {
  await page.goto(`/00/${NO_PHI}`);
  await expect(page.getByText('Safe-to-harvest interval not confirmed')).toBeVisible();
  await expect(page.getByText('Safe-to-harvest interval respected')).toHaveCount(0);
});

test('language switch keeps the page and shows Bengali', async ({ page }) => {
  await page.goto(`/00/${SETTLED}`, { waitUntil: 'networkidle' }); // dev server: let hydration finish before the click
  await page.getByRole('link', { name: 'বাংলা' }).click();
  await expect(page).toHaveURL(new RegExp(`/00/${SETTLED}\\?lang=bn`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('আলু');
  await expect(page.locator('div[lang="bn"]').first()).toBeVisible();
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Potato');
});

test('home: manual entry opens the lot, bad number shows an error', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/18-digit number/).fill(`${SETTLED.slice(0, 1)} ${SETTLED.slice(1)}`);
  await page.getByRole('button', { name: 'Show this lot' }).click();
  await expect(page).toHaveURL(new RegExp(`/00/${SETTLED}$`));
  await page.goto('/');
  await page.getByLabel(/18-digit number/).fill('123');
  await page.getByRole('button', { name: 'Show this lot' }).click();
  await expect(page.getByRole('alert')).toContainText('not a valid lot number');
});

test('unknown and malformed codes get a designed not-found message', async ({ page }) => {
  await page.goto(`/00/${UNKNOWN}`);
  await expect(page.getByRole('heading', { name: 'We cannot find this lot' })).toBeVisible();
  await page.goto('/00/not-a-code');
  await expect(page.getByRole('heading', { name: 'We cannot find this lot' })).toBeVisible();
});

test('360 px viewport: no horizontal scroll on home and lot pages', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await ctx.newPage();
  for (const url of ['/', `/00/${SETTLED}`, `/00/${SETTLED}?lang=bn`, `/00/${BREACH}`]) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await ctx.close();
});

test('no farmer name or phone anywhere in the server-rendered HTML, and no GI wording', async ({ request }) => {
  const farmers = fixtures('farmers.json').examples.flatMap((e) => (Array.isArray(e.body?.items) ? e.body.items : e.body?.name ? [e.body] : []));
  const secrets = new Set<string>();
  for (const f of farmers) for (const v of [f.name, f.nameLocal, f.phone, f.id, f.farmerToken]) if (typeof v === 'string' && v.length > 3) secrets.add(v);
  expect(secrets.size).toBeGreaterThan(5); // the check is meaningful only if the seed was found
  const ssccs = provenance.map((e) => e.params!.sscc!);
  expect(ssccs.length).toBeGreaterThan(5);
  for (const sscc of ssccs) {
    for (const lang of ['', '?lang=bn']) {
      const html = await (await request.get(`/00/${sscc}${lang}`)).text();
      for (const s of secrets) expect(html, `${sscc}${lang} leaks ${s}`).not.toContain(s);
      expect(html).not.toMatch(/geographical indication|\bGI\b/i);
      expect(html).toContain('Academic prototype');
    }
  }
});

test('journey shows the recorded date and time in IST, in order', async ({ page }) => {
  await page.goto(`/00/${SETTLED}`);
  await expect(page.getByText('recorded on the ledger, in Indian Standard Time')).toBeVisible();
  const stamps = await page.locator('#journey ~ ol li p.text-sm').allTextContents();
  expect(stamps).toHaveLength(5);
  for (const s of stamps) expect(s).toMatch(/^\d{2}-\d{2}-\d{4}, \d{2}:\d{2} IST · /);
  expect(new Set(stamps.map((s) => s.split(' · ')[0])).size).toBe(5); // every step has its own recorded time
});
