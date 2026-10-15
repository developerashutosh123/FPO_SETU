// Prepares every signed value the CLI smoke test needs, using the SAME canonicalJson() as the portals (shared/contract.ts).
//   node --experimental-strip-types scripts/smoke-crypto.mjs <wallet dir>   -> JSON on stdout
// Farmer keys are throwaway; device keys are the enrolled WB-CHG-01 and QM-CHG-01 keys from the wallet.
import { generateKeyPairSync, sign, createPrivateKey, X509Certificate, createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson, ssccCheckDigit } from '../../shared/contract.ts';

const wallet = process.argv[2];
const sha = (s) => createHash('sha256').update(s).digest('hex');
const pubHexOf = (jwk) => '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
const signHex = (privateKey, text) => sign('sha256', Buffer.from(text, 'utf8'), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex');
const loadDevice = (id) => {
  const dir = join(wallet, 'FpoOrgMSP', id);
  const key = createPrivateKey(readFileSync(join(dir, 'key.pem')));
  const cert = new X509Certificate(readFileSync(join(dir, 'cert.pem')));
  return { key, pubHex: pubHexOf(cert.publicKey.export({ format: 'jwk' })) };
};

const rnd = (n, alphabet) => Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
const serial = () => String(900000000 + (randomBytes(4).readUInt32BE() % 99999999));
const ssccOf = (s) => { const body = `08901234${s}`; return body + ssccCheckDigit(body); };

const farmer = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const token = 'FT-' + randomBytes(8).toString('hex');
const plotId = 'PL-' + rnd(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
const serA = serial(), serB = String(Number(serA) + 1);
const ssccA = ssccOf(serA), ssccB = ssccOf(serB);
const hum = (s) => `WB-PSM-KGP2-POT-FPO07-2026-R-${s.slice(-5)}`;
const payload = (sscc, bagCount) => ({ sscc, farmerToken: token, plotId, commodity: 'POTATO', bagCount, estWeightKg: bagCount * 50, harvestOrUnloadDate: '2026-11-02' });
const f2A = payload(ssccA, 40), f2B = payload(ssccB, 40);

const wb = loadDevice('WB-CHG-01'), qm = loadDevice('QM-CHG-01');
const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
const wbReading = { deviceId: 'WB-CHG-01', grossKg: 3204, tareKg: 1240, netKg: 1964, at };
const qmReading = { deviceId: 'QM-CHG-01', at, potato: { sizeGradeMm: '45-55', greeningPct: 0.8, rotPct: 0.4, cutsPct: 1.2 } };
// a reading whose number was changed after signing (the F3 negative case, not used on the happy path)
const wbForged = { ...wbReading, netKg: 1999, grossKg: 3239 };

const out = {
  farmer: { token, plotId, pubHex: pubHexOf(farmer.publicKey.export({ format: 'jwk' })), consentHash: sha('consent:' + token), polygonHash: sha('polygon:' + plotId) },
  lotA: { sscc: ssccA, humanRef: hum(serA), f2: canonicalJson(f2A), sig: signHex(farmer.privateKey, canonicalJson(f2A)) },
  lotB: { sscc: ssccB, humanRef: hum(serB), sigOfBagCount40: signHex(farmer.privateKey, canonicalJson(f2B)) },
  devices: { wb: { id: 'WB-CHG-01', pubHex: wb.pubHex }, qm: { id: 'QM-CHG-01', pubHex: qm.pubHex } },
  readings: {
    wb: canonicalJson(wbReading), wbSig: signHex(wb.key, canonicalJson(wbReading)),
    qm: canonicalJson(qmReading), qmSig: signHex(qm.key, canonicalJson(qmReading)),
    wbForged: canonicalJson(wbForged), wbForgedSigFromOriginal: signHex(wb.key, canonicalJson(wbReading)),
  },
  hashes: { digest: sha('cold-chain-log:' + ssccA) },
};
process.stdout.write(JSON.stringify(out));
