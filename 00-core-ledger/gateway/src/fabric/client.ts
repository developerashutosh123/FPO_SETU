import * as grpc from '@grpc/grpc-js';
import { connect, type Gateway } from '@hyperledger/fabric-gateway';
import { readFileSync } from 'node:fs';
import { common, peer as peerProtos } from '@hyperledger/fabric-protos';
import type { Channel, LedgerReceipt, OrgMsp } from '../contract/contract.js';
import type { Config } from '../config.js';
import { HttpError, parseChaincodeMessage } from '../errors.js';
import { decodeBlock, decodeEnvelope, validationName, type DecodedBlock, type DecodedTx } from './decode.js';
import { loadIdentity, type FabricUser } from './identities.js';
import type { Ledger, SubmitOptions, SubmitResult } from './ledger.js';
import { peerOf, type ChaincodeName } from './topology.js';

const dec = new TextDecoder();

/** Maps any error thrown by the Fabric Gateway SDK to the contract's error codes. */
export function mapFabricError(e: unknown): HttpError {
  if (e instanceof HttpError) return e;
  const err = e as { message?: string; details?: { message?: string }[]; code?: number | string; transactionId?: string; name?: string; cause?: unknown };
  const texts = [err.message ?? '', ...(err.details ?? []).map((d) => d.message ?? ''), String((err.cause as { message?: string } | undefined)?.message ?? '')];
  for (const t of texts) {
    const parsed = parseChaincodeMessage(t);
    if (parsed) return new HttpError(parsed.code, parsed.message, { txId: err.transactionId });
  }
  if (err.name === 'CommitError' || (typeof err.code === 'number' && err.transactionId)) {
    return new HttpError('ERR_INVALID_STATE', `The ledger rejected the transaction when committing it (${err.message ?? 'validation failure'}).`, { txId: err.transactionId });
  }
  const text = texts.join(' ');
  if (/UNAVAILABLE|ECONNREFUSED|DEADLINE_EXCEEDED|No connection established|Connect Failed/i.test(text)) {
    return new HttpError('ERR_LEDGER_UNAVAILABLE', 'The ledger node is not reachable. Try again in a moment.');
  }
  return new HttpError('ERR_INVALID_STATE', err.message ?? 'Unexpected ledger error.');
}

export class FabricLedger implements Ledger {
  readonly mode = 'live' as const;
  private clients = new Map<OrgMsp, grpc.Client>();
  private gateways = new Map<string, Gateway>();

  constructor(private cfg: Pick<Config, 'networkDir' | 'walletDir'>) {}

  private grpcClient(msp: OrgMsp): grpc.Client {
    let c = this.clients.get(msp);
    if (!c) {
      const p = peerOf(this.cfg.networkDir, msp);
      c = new grpc.Client(p.endpoint, grpc.credentials.createSsl(readFileSync(p.tlsCaPath)), { 'grpc.ssl_target_name_override': p.host });
      this.clients.set(msp, c);
    }
    return c;
  }

  private gateway(user: FabricUser): Gateway {
    const key = `${user.msp}/${user.username}`;
    let g = this.gateways.get(key);
    if (!g) {
      const id = loadIdentity(this.cfg.walletDir, user);
      g = connect({
        client: this.grpcClient(user.msp), identity: id.identity, signer: id.signer,
        evaluateOptions: () => ({ deadline: Date.now() + 8_000 }),
        endorseOptions: () => ({ deadline: Date.now() + 20_000 }),
        submitOptions: () => ({ deadline: Date.now() + 10_000 }),
        commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
      });
      this.gateways.set(key, g);
    }
    return g;
  }

  async submit(user: FabricUser, channel: Channel, chaincode: ChaincodeName, fn: string, args: string[], opts: SubmitOptions): Promise<SubmitResult> {
    const contract = this.gateway(user).getNetwork(channel).getContract(chaincode);
    let lastError: unknown;
    for (const orgs of opts.endorse) {
      try {
        const proposal = contract.newProposal(fn, { arguments: args, transientData: opts.transient, endorsingOrganizations: orgs });
        const tx = await proposal.endorse();
        const result = dec.decode(tx.getResult());
        const submitted = await tx.submit();
        const status = await submitted.getStatus();
        if (!status.successful) {
          throw new HttpError('ERR_INVALID_STATE', `The ledger rejected the transaction when committing it (${validationName(status.code)}).`, { txId: submitted.getTransactionId() });
        }
        const txId = submitted.getTransactionId();
        const decoded = await this.getTransaction(channel, txId, user);
        const receipt: LedgerReceipt = {
          txId, channel, chaincode, fn, blockNumber: Number(status.blockNumber), validationCode: 'VALID',
          endorsers: [...new Set(decoded.endorsers)] as OrgMsp[], committedAt: decoded.timestamp,
        };
        return { receipt, result };
      } catch (e) {
        lastError = e;
        const mapped = mapFabricError(e);
        // a chaincode rule violation is final; only an unreachable peer justifies trying the next endorser set
        if (mapped.code !== 'ERR_LEDGER_UNAVAILABLE') throw mapped;
      }
    }
    throw mapFabricError(lastError);
  }

  async evaluate(user: FabricUser, channel: Channel, chaincode: ChaincodeName, fn: string, args: string[]): Promise<string> {
    try {
      return dec.decode(await this.gateway(user).getNetwork(channel).getContract(chaincode).evaluateTransaction(fn, ...args));
    } catch (e) { throw mapFabricError(e); }
  }

  private qscc(user: FabricUser, channel: Channel) { return this.gateway(user).getNetwork(channel).getContract('qscc'); }

  async chainHeight(channel: Channel, user: FabricUser): Promise<number> {
    try {
      const info = common.BlockchainInfo.deserializeBinary(await this.qscc(user, channel).evaluateTransaction('GetChainInfo', channel));
      return Number(info.getHeight());
    } catch (e) { throw mapFabricError(e); }
  }

  async getBlock(channel: Channel, number: number, user: FabricUser): Promise<DecodedBlock> {
    try { return decodeBlock(await this.qscc(user, channel).evaluateTransaction('GetBlockByNumber', channel, String(number))); }
    catch (e) {
      const m = mapFabricError(e);
      throw /out of range|not found|Entry not found/i.test(m.message) ? new HttpError('ERR_NOT_FOUND', `Block ${number} does not exist on ${channel}.`) : m;
    }
  }

  async getBlockByTxId(channel: Channel, txId: string, user: FabricUser): Promise<DecodedBlock> {
    try { return decodeBlock(await this.qscc(user, channel).evaluateTransaction('GetBlockByTxID', channel, txId)); }
    catch (e) {
      const m = mapFabricError(e);
      throw /not found|does not exist|Entry not found/i.test(m.message) ? new HttpError('ERR_NOT_FOUND', `Transaction ${txId} was not found on ${channel}.`) : m;
    }
  }

  /** Raw block bytes, for test fixtures and tooling. */
  async rawBlock(channel: Channel, number: number, user: FabricUser): Promise<Uint8Array> {
    try { return await this.qscc(user, channel).evaluateTransaction('GetBlockByNumber', channel, String(number)); } catch (e) { throw mapFabricError(e); }
  }

  async getTransaction(channel: Channel, txId: string, user: FabricUser): Promise<DecodedTx> {
    let bytes: Uint8Array;
    try { bytes = await this.qscc(user, channel).evaluateTransaction('GetTransactionByID', channel, txId); }
    catch (e) {
      const m = mapFabricError(e);
      throw /not found|does not exist|Entry not found/i.test(m.message) ? new HttpError('ERR_NOT_FOUND', `Transaction ${txId} was not found on ${channel}.`) : m;
    }
    const processed = peerProtos.ProcessedTransaction.deserializeBinary(bytes);
    const env = processed.getTransactionenvelope();
    const tx = env ? decodeEnvelope(env.serializeBinary(), processed.getValidationcode()) : undefined;
    if (!tx) throw new HttpError('ERR_NOT_FOUND', `Transaction ${txId} could not be decoded.`);
    return tx;
  }

  async *blocks(channel: Channel, start: number, user: FabricUser, signal: AbortSignal): AsyncIterable<DecodedBlock> {
    const network = this.gateway(user).getNetwork(channel);
    const events = await network.getBlockEvents({ startBlock: BigInt(start) });
    const stop = () => events.close();
    if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
    try {
      for await (const ev of events) yield decodeBlock(ev.serializeBinary());
    } catch (e) {
      if (signal.aborted) return;
      throw e;
    } finally { signal.removeEventListener('abort', stop); events.close(); }
  }

  async peerStatus() {
    const out: { org: OrgMsp; name: string; up: boolean }[] = [];
    for (const org of ['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP', 'RegulatorOrgMSP'] as OrgMsp[]) {
      const state = this.grpcClient(org).getChannel().getConnectivityState(true);
      out.push({ org, name: peerOf(this.cfg.networkDir, org).host, up: state !== grpc.connectivityState.TRANSIENT_FAILURE && state !== grpc.connectivityState.SHUTDOWN });
    }
    return out;
  }

  close() { for (const g of this.gateways.values()) g.close(); for (const c of this.clients.values()) c.close(); this.gateways.clear(); this.clients.clear(); }
}
