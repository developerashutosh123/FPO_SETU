/** Small key-value store over localStorage. Every access is guarded: private windows and blocked site data throw. */
const mem = new Map<string, string>();
export function kvGet(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? mem.get(key) ?? null; } catch { return mem.get(key) ?? null; }
}
export function kvSet(key: string, value: string): void {
  mem.set(key, value);
  try { globalThis.localStorage?.setItem(key, value); } catch { /* memory copy is enough for this tab */ }
}
export function kvDel(key: string): void {
  mem.delete(key);
  try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
}
export function kvGetJson<T>(key: string): T | null {
  const raw = kvGet(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
