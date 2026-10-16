// Decoding of Fabric blocks and transactions (envelope, endorsements, read/write set keys, chaincode events).
// Used by the explorer routes (qscc), by the receipts (endorsers) and by the indexer. Values are never returned, only keys.
import { createHash } from 'node:crypto';
import { common, ledger, msp, peer } from '@hyperledger/fabric-protos';

export interface DecodedEvent { name: string; payload: Uint8Array; chaincode: string }
export interface DecodedTx {
  txId: string;
  channel: string;
  /** ENDORSER_TRANSACTION = 3, CONFIG = 1 */
  type: number;
  timestamp: string; // ISO
  creatorMsp: string;
  chaincode: string;
  fn: string;
  args: string[]; // arguments after the function name; transient data is not part of the envelope
  endorsers: string[]; // MSP IDs, one per endorsement
  reads: string[];
  writes: string[];
  events: DecodedEvent[];
  validationCode: string; // VALID, ENDORSEMENT_POLICY_FAILURE, ...
}
export interface DecodedBlock {
  number: number;
  dataHash: string;
  previousHash: string;
  blockHash: string;
  time: string;
  txs: DecodedTx[];
}

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const utf8 = (b: Uint8Array) => Buffer.from(b).toString('utf8');
const CODE_NAMES: Record<number, string> = Object.fromEntries(Object.entries(peer.TxValidationCode).map(([k, v]) => [v as number, k]));
export const validationName = (code: number) => CODE_NAMES[code] ?? `CODE_${code}`;

function iso(ts: { getSeconds(): number; getNanos(): number } | undefined): string {
  if (!ts) return new Date(0).toISOString();
  return new Date(ts.getSeconds() * 1000 + Math.floor(ts.getNanos() / 1e6)).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function mspOf(identityBytes: Uint8Array): string {
  try { return msp.SerializedIdentity.deserializeBinary(identityBytes).getMspid(); } catch { return ''; }
}

/** Decode one transaction envelope. Returns undefined for envelopes that are not endorser transactions or cannot be parsed. */
export function decodeEnvelope(envBytes: Uint8Array, validation = 0): DecodedTx | undefined {
  let payload: common.Payload;
  try { payload = common.Payload.deserializeBinary(common.Envelope.deserializeBinary(envBytes).getPayload_asU8()); } catch { return undefined; }
  const header = payload.getHeader();
  if (!header) return undefined;
  const ch = common.ChannelHeader.deserializeBinary(header.getChannelHeader_asU8());
  const sh = common.SignatureHeader.deserializeBinary(header.getSignatureHeader_asU8());
  const base: DecodedTx = {
    txId: ch.getTxId(), channel: ch.getChannelId(), type: ch.getType(), timestamp: iso(ch.getTimestamp()), creatorMsp: mspOf(sh.getCreator_asU8()),
    chaincode: '', fn: '', args: [], endorsers: [], reads: [], writes: [], events: [], validationCode: validationName(validation),
  };
  if (ch.getType() !== common.HeaderType.ENDORSER_TRANSACTION) return base;
  const tx = peer.Transaction.deserializeBinary(payload.getData_asU8());
  const action = tx.getActionsList()[0];
  if (!action) return base;
  const ccPayload = peer.ChaincodeActionPayload.deserializeBinary(action.getPayload_asU8());
  // what was invoked
  const prop = peer.ChaincodeProposalPayload.deserializeBinary(ccPayload.getChaincodeProposalPayload_asU8());
  const spec = peer.ChaincodeInvocationSpec.deserializeBinary(prop.getInput_asU8()).getChaincodeSpec();
  const args = (spec?.getInput()?.getArgsList_asU8() ?? []).map(utf8);
  base.chaincode = spec?.getChaincodeId()?.getName() ?? '';
  base.fn = args[0] ?? '';
  base.args = args.slice(1);
  // what was endorsed
  const endorsed = ccPayload.getAction();
  if (!endorsed) return base;
  base.endorsers = endorsed.getEndorsementsList().map((e) => mspOf(e.getEndorser_asU8()));
  const prp = peer.ProposalResponsePayload.deserializeBinary(endorsed.getProposalResponsePayload_asU8());
  const cca = peer.ChaincodeAction.deserializeBinary(prp.getExtension_asU8());
  const evBytes = cca.getEvents_asU8();
  if (evBytes.length > 0) {
    const ev = peer.ChaincodeEvent.deserializeBinary(evBytes);
    if (ev.getEventName()) base.events.push({ name: ev.getEventName(), payload: ev.getPayload_asU8(), chaincode: ev.getChaincodeId() });
  }
  const rw = ledger.rwset.TxReadWriteSet.deserializeBinary(cca.getResults_asU8());
  for (const ns of rw.getNsRwsetList()) {
    if (ns.getNamespace() === base.chaincode) {
      const kv = ledger.rwset.kvrwset.KVRWSet.deserializeBinary(ns.getRwset_asU8());
      base.reads.push(...kv.getReadsList().map((r) => r.getKey()));
      base.writes.push(...kv.getWritesList().map((w) => w.getKey()));
    }
    // private data appears on the public ledger as hashes only: record that a collection was touched, never the key or value
    for (const c of ns.getCollectionHashedRwsetList()) {
      const marker = `$$h$${c.getCollectionName()}`;
      const h = ledger.rwset.kvrwset.HashedRWSet.deserializeBinary(c.getHashedRwset_asU8());
      if (h.getHashedWritesList().length > 0 && !base.writes.includes(marker)) base.writes.push(marker);
      if (h.getHashedReadsList().length > 0 && !base.reads.includes(marker)) base.reads.push(marker);
    }
  }
  return base;
}

/** Fabric block hash: SHA-256 over the DER encoding of SEQUENCE { INTEGER number, OCTET STRING previousHash, OCTET STRING dataHash }. */
export function blockHeaderHash(number: number, previousHash: Uint8Array, dataHash: Uint8Array): string {
  const len = (n: number) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]));
  const tlv = (tag: number, body: Buffer) => Buffer.concat([Buffer.from([tag]), len(body.length), body]);
  let n = Buffer.alloc(0);
  if (number === 0) n = Buffer.from([0]);
  else { let v = number; const bytes: number[] = []; while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); } if (bytes[0]! & 0x80) bytes.unshift(0); n = Buffer.from(bytes); }
  const der = tlv(0x30, Buffer.concat([tlv(0x02, n), tlv(0x04, Buffer.from(previousHash)), tlv(0x04, Buffer.from(dataHash))]));
  return createHash('sha256').update(der).digest('hex');
}

export function decodeBlock(blockBytes: Uint8Array): DecodedBlock {
  const block = common.Block.deserializeBinary(blockBytes);
  const header = block.getHeader()!;
  const number = Number(header.getNumber());
  const rawFilter = block.getMetadata()?.getMetadataList()[common.BlockMetadataIndex.TRANSACTIONS_FILTER];
  const filter = typeof rawFilter === 'string' ? Buffer.from(rawFilter, 'base64') : (rawFilter ?? new Uint8Array());
  const txs: DecodedTx[] = [];
  block.getData()!.getDataList_asU8().forEach((env, i) => {
    const tx = decodeEnvelope(env, filter[i] ?? 0);
    if (tx) txs.push(tx);
  });
  const times = txs.map((t) => t.timestamp).sort();
  return {
    number,
    dataHash: hex(header.getDataHash_asU8()),
    previousHash: hex(header.getPreviousHash_asU8()),
    blockHash: blockHeaderHash(number, header.getPreviousHash_asU8(), header.getDataHash_asU8()),
    time: times[times.length - 1] ?? new Date(0).toISOString(),
    txs,
  };
}
