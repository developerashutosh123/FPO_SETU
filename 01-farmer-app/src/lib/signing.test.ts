import { describe, expect, it } from 'vitest';
import { canonicalJson, type LotCommissionPayload, type PendingLotDraft } from '../contract/contract';
import { checkDraftPayload, exportPublicKeyHex, generateDeviceKeyPair, signPayloadHex } from './signing';

// The pending draft from shared/fixtures/lots.json (listPendingDrafts): payloadToSign is canonical JSON from the gateway.
const draft: PendingLotDraft = {
  sscc: '089012340000004906', humanRef: 'WB-PSM-KGP2-POT-FPO07-2026-R-00490',
  payloadToSign: '{"bagCount":40,"commodity":"POTATO","estWeightKg":2000,"farmerToken":"FT-9c2e41a07b55d3f1","harvestOrUnloadDate":"2026-11-13","plotId":"PL-7Q2M9X4K1A","sscc":"089012340000004906"}',
  commodity: 'POTATO', variety: 'Kufri Jyoti', village: 'CHANGUAL', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: '2026-11-13', createdBy: 'subhankar.vle', createdAt: '2026-11-14T11:32:00Z',
};

describe('device signing (CONTRACT.md section 7 wire formats)', () => {
  it('the fixture payload is exactly canonicalJson of the commission payload', () => {
    const p: LotCommissionPayload = { sscc: draft.sscc, farmerToken: 'FT-9c2e41a07b55d3f1', plotId: 'PL-7Q2M9X4K1A', commodity: 'POTATO', bagCount: 40, estWeightKg: 2000, harvestOrUnloadDate: '2026-11-13' };
    expect(canonicalJson(p)).toBe(draft.payloadToSign);
  });

  it('public key is 130 hex (04||X||Y), signature 128 hex (r||s), and verifies over the exact UTF-8 bytes', async () => {
    const pair = await generateDeviceKeyPair();
    const pub = await exportPublicKeyHex(pair.publicKey);
    const sig = await signPayloadHex(pair.privateKey, draft.payloadToSign);
    expect(pub).toMatch(/^04[0-9a-f]{128}$/);
    expect(sig).toMatch(/^[0-9a-f]{128}$/);
    const raw = Uint8Array.from(pub.match(/../g)!.map((h) => parseInt(h, 16)));
    const key = await crypto.subtle.importKey('raw', raw, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const bytes = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
    const ok = (msg: string) => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, bytes(sig), new TextEncoder().encode(msg));
    expect(await ok(draft.payloadToSign)).toBe(true);
    expect(await ok(draft.payloadToSign.replace('40', '41'))).toBe(false);
  });

  it('the private key cannot be exported', async () => {
    const pair = await generateDeviceKeyPair();
    await expect(crypto.subtle.exportKey('pkcs8', pair.privateKey)).rejects.toThrow();
    expect(pair.privateKey.extractable).toBe(false);
  });

  it('accepts a draft whose payload is canonical and matches what is on screen', () => {
    expect(checkDraftPayload(draft)).toEqual({ ok: true });
  });
  it('refuses a payload that differs from the shown draft', () => {
    expect(checkDraftPayload({ ...draft, bagCount: 41 })).toEqual({ ok: false, reason: 'MISMATCH', field: 'bagCount' });
    expect(checkDraftPayload({ ...draft, harvestOrUnloadDate: '2026-11-14' })).toMatchObject({ ok: false, field: 'harvestOrUnloadDate' });
  });
  it('refuses a payload that is not canonical or not JSON', () => {
    expect(checkDraftPayload({ ...draft, payloadToSign: JSON.stringify(JSON.parse(draft.payloadToSign), null, 1) })).toEqual({ ok: false, reason: 'NOT_CANONICAL' });
    expect(checkDraftPayload({ ...draft, payloadToSign: 'not json' })).toEqual({ ok: false, reason: 'NOT_JSON' });
  });
});
