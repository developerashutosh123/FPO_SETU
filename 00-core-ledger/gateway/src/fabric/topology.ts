import { join } from 'node:path';
import type { Channel, OrgMsp } from '../contract/contract.js';

export type ChaincodeName = 'lot-lifecycle' | 'pledge-lien' | 'order-settlement';

export const ORG_KEY: Record<OrgMsp, 'fpo' | 'bank' | 'buyer' | 'regulator'> = { FpoOrgMSP: 'fpo', BankOrgMSP: 'bank', BuyerOrgMSP: 'buyer', RegulatorOrgMSP: 'regulator' };
const PEER_PORT: Record<OrgMsp, number> = { FpoOrgMSP: 7051, BankOrgMSP: 9051, BuyerOrgMSP: 11051, RegulatorOrgMSP: 13051 };

export const CHANNEL_CHAINCODE: Record<Channel, ChaincodeName> = { 'trace-channel': 'lot-lifecycle', 'finance-channel': 'pledge-lien', 'trade-channel': 'order-settlement' };
export const CHAINCODE_CHANNEL: Record<ChaincodeName, Channel> = { 'lot-lifecycle': 'trace-channel', 'pledge-lien': 'finance-channel', 'order-settlement': 'trade-channel' };
export const CHANNEL_MEMBERS: Record<Channel, OrgMsp[]> = {
  'trace-channel': ['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP', 'RegulatorOrgMSP'],
  'finance-channel': ['FpoOrgMSP', 'BankOrgMSP', 'RegulatorOrgMSP'],
  'trade-channel': ['FpoOrgMSP', 'BuyerOrgMSP'],
};
export const CHANNELS = Object.keys(CHANNEL_MEMBERS) as Channel[];

export interface PeerEndpoint { endpoint: string; host: string; tlsCaPath: string }
export function peerOf(networkDir: string, msp: OrgMsp, hostOverride?: string): PeerEndpoint {
  const k = ORG_KEY[msp];
  const host = `peer0.${k}.setu.local`;
  return { endpoint: `${hostOverride ?? 'localhost'}:${PEER_PORT[msp]}`, host, tlsCaPath: join(networkDir, 'organizations', 'peerOrganizations', `${k}.setu.local`, 'peers', host, 'tls', 'ca.crt') };
}

/**
 * Endorsing org sets per chaincode call. Private-data calls MUST be limited to the collection members, because the transient
 * data goes to every endorsing peer. Where several sets are listed, the next one is tried when a peer is unreachable.
 */
const FPO: OrgMsp = 'FpoOrgMSP', BANK: OrgMsp = 'BankOrgMSP', BUYER: OrgMsp = 'BuyerOrgMSP', REG: OrgMsp = 'RegulatorOrgMSP';
export const ENDORSE = {
  trace: [[FPO, BANK, REG], [FPO, BANK, BUYER], [FPO, BUYER, REG]] as OrgMsp[][],
  /** custody and anything after it: the state-based policy wants FPO and Buyer, the chaincode policy wants 3 of 4 */
  traceWithBuyer: [[FPO, BUYER, BANK], [FPO, BUYER, REG]] as OrgMsp[][],
  finance: [[FPO, BANK]] as OrgMsp[][],
  trade: [[FPO, BUYER]] as OrgMsp[][],
};
