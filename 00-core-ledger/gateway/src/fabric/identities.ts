import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signers, type Identity, type Signer } from '@hyperledger/fabric-gateway';
import type { OrgMsp } from '../contract/contract.js';

export interface FabricUser { username: string; msp: OrgMsp }

export interface LoadedIdentity { identity: Identity; signer: Signer; certPem: string; privateKeyPem: string }

/** Loads wallet/<MSP>/<username>/{cert.pem,key.pem} (written by network/scripts/enroll.sh). */
export function loadIdentity(walletDir: string, user: FabricUser): LoadedIdentity {
  const dir = join(walletDir, user.msp, user.username);
  if (!existsSync(join(dir, 'cert.pem'))) throw new Error(`No Fabric identity for ${user.username} in ${user.msp}. Run make up (network/scripts/enroll.sh) first.`);
  const certPem = readFileSync(join(dir, 'cert.pem'), 'utf8');
  const privateKeyPem = readFileSync(join(dir, 'key.pem'), 'utf8');
  return { identity: { mspId: user.msp, credentials: Buffer.from(certPem) }, signer: signers.newPrivateKeySigner(createPrivateKey(privateKeyPem)), certPem, privateKeyPem };
}

/** Uncompressed SEC1 public key (04||X||Y, 130 hex chars) of an enrolled identity: what chaincode registers for a device. */
export function publicKeyHexOfCert(certPem: string): string {
  const jwk = new X509Certificate(certPem).publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  return '04' + Buffer.from(jwk.x, 'base64url').toString('hex') + Buffer.from(jwk.y, 'base64url').toString('hex');
}
