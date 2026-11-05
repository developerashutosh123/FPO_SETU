import { canonicalJson, type LotCommissionPayload, type PendingLotDraft } from '../contract/contract';

/** Pure signing helpers (no storage), so they run unchanged in the browser and in the unit tests. Wire formats: CONTRACT.md section 7. */
const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('DEVICE_KEY_UNSUPPORTED');
  return s;
};

export const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export async function generateDeviceKeyPair(): Promise<CryptoKeyPair> {
  // The private key is non-extractable: the page's JavaScript can ask it to sign but can never read it out.
  return subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']) as Promise<CryptoKeyPair>;
}

/** 130 hex chars: uncompressed SEC1 point 04 || X || Y. */
export async function exportPublicKeyHex(publicKey: CryptoKey): Promise<string> {
  return toHex(await subtle().exportKey('raw', publicKey));
}

/** 128 hex chars: r || s, big-endian (IEEE P1363, what Web Crypto produces). Signs the UTF-8 bytes of `payload` exactly as given. */
export async function signPayloadHex(privateKey: CryptoKey, payload: string): Promise<string> {
  const sig = await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(payload));
  return toHex(sig);
}

export type DraftCheck = { ok: true } | { ok: false; reason: 'NOT_JSON' | 'NOT_CANONICAL' | 'MISMATCH'; field?: string };

/**
 * Refuses to sign a payload that is not what the farmer was shown. `payloadToSign` is signed as received (it is already canonical JSON),
 * so this only checks: it parses, it is byte-identical to its own canonical form, and its fields equal the draft fields on screen.
 */
export function checkDraftPayload(draft: PendingLotDraft): DraftCheck {
  let p: LotCommissionPayload;
  try { p = JSON.parse(draft.payloadToSign) as LotCommissionPayload; } catch { return { ok: false, reason: 'NOT_JSON' }; }
  try { if (canonicalJson(p) !== draft.payloadToSign) return { ok: false, reason: 'NOT_CANONICAL' }; } catch { return { ok: false, reason: 'NOT_CANONICAL' }; }
  const pairs: [string, unknown, unknown][] = [
    ['sscc', p.sscc, draft.sscc], ['commodity', p.commodity, draft.commodity], ['bagCount', p.bagCount, draft.bagCount],
    ['estWeightKg', p.estWeightKg, draft.estWeightKg], ['harvestOrUnloadDate', p.harvestOrUnloadDate, draft.harvestOrUnloadDate],
  ];
  const bad = pairs.find(([, a, b]) => a !== b);
  return bad ? { ok: false, reason: 'MISMATCH', field: bad[0] } : { ok: true };
}
