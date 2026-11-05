import { exportPublicKeyHex, generateDeviceKeyPair, signPayloadHex } from './signing';
import { api } from './api';

/**
 * The farmer's signing key on this phone (web build): an ECDSA P-256 key pair made with Web Crypto, the private half non-extractable,
 * kept in IndexedDB as a CryptoKey object. One key per signed-in farmer. Needs a secure context (https or localhost).
 */
const DB = 'fposetu-device';
const STORE = 'keys';

interface StoredKey { privateKey: CryptoKey; publicKey: CryptoKey; publicKeyHex: string; registeredAt?: string }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('DEVICE_KEY_UNSUPPORTED'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('DEVICE_KEY_UNSUPPORTED'));
  });
}
async function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
const load = (userId: string) => idb<StoredKey | undefined>('readonly', (s) => s.get(userId));
const save = (userId: string, k: StoredKey) => idb('readwrite', (s) => s.put(k, userId));

/** The key for this farmer; made on first use. `created` is true the first time on this phone. */
export async function getOrCreateKey(userId: string): Promise<StoredKey & { created: boolean }> {
  const found = await load(userId);
  if (found) return { ...found, created: false };
  const pair = await generateDeviceKeyPair();
  const fresh: StoredKey = { privateKey: pair.privateKey, publicKey: pair.publicKey, publicKeyHex: await exportPublicKeyHex(pair.publicKey) };
  await save(userId, fresh);
  return { ...fresh, created: true };
}

/** Makes sure this phone has a key and that the gateway has its public half (POST /farmers/me/device-key). Safe to call again. */
export async function ensureRegistered(userId: string, force = false): Promise<{ created: boolean; publicKeyHex: string }> {
  const k = await getOrCreateKey(userId);
  if (!k.registeredAt || force) {
    await api.registerDeviceKey(k.publicKeyHex);
    await save(userId, { privateKey: k.privateKey, publicKey: k.publicKey, publicKeyHex: k.publicKeyHex, registeredAt: new Date().toISOString() });
  }
  return { created: k.created, publicKeyHex: k.publicKeyHex };
}

/** Signs `payload` (the string exactly as the gateway sent it) with this farmer's device key. */
export async function signWithDeviceKey(userId: string, payload: string): Promise<string> {
  const k = await load(userId);
  if (!k) throw new Error('DEVICE_KEY_MISSING');
  return signPayloadHex(k.privateKey, payload);
}
