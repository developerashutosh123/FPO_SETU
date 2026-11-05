/** SHA-256 of some bytes as lowercase hex, using Web Crypto (contract 9.3 item 1: "Re-verify" recomputes in the browser). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
