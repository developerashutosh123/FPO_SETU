'use client';
import { Check, Minus } from 'lucide-react';
import { ORG_DISPLAY, type Channel, type LedgerStatus, type OrgMsp } from '@/contract/contract';
import { api } from '@/lib/api';
import { RequireAuth } from '@/lib/auth';
import { useApi } from '@/lib/useApi';
import { useLedgerStream } from '@/lib/useLedgerStream';
import { channelShort, formatCount, formatDateTimeIST } from '@/lib/format';
import { Chip, OrgBadge, PageHeader, Section } from '@/components/ui';
import { Boundary } from '@/components/states';

const CHANNELS: Channel[] = ['trace-channel', 'finance-channel', 'trade-channel'];
const ORGS: OrgMsp[] = ['FpoOrgMSP', 'BankOrgMSP', 'BuyerOrgMSP', 'RegulatorOrgMSP'];

export default function NetworkPage() {
  return <RequireAuth>{() => <Network />}</RequireAuth>;
}

function Network() {
  const state = useApi((s) => api.ledgerStatus(s), [], { refreshMs: 20_000 });
  useLedgerStream({ onEvent: () => state.reload(), onPoll: () => state.reload() });

  return (
    <>
      <PageHeader eyebrow="Network" title="Four organisations run the peers, and three orderers keep them in the same order">
        Status of every Fabric peer and orderer, and which organisation sits on which channel.
      </PageHeader>
      <Boundary state={state}>{(s) => <Body s={s} />}</Boundary>
    </>
  );
}

function Body({ s }: { s: LedgerStatus }) {
  const leaderOf = (o: LedgerStatus['orderers'][number]): Channel[] => o.leaderOf ?? (o.raftLeader ? ['trace-channel'] : []);
  const leaders = Object.fromEntries(CHANNELS.map((c) => [c, s.orderers.find((o) => leaderOf(o).includes(c))?.name]));
  const heightOf = (c: Channel) => s.channels.find((x) => x.name === c)?.height;

  return (
    <>
      {s.mode === 'index-only' && (
        <p role="note" className="mb-6 rounded-sm border px-3 py-2 text-sm" data-testid="status-note"
          style={{ borderColor: 'color-mix(in srgb, var(--warn-text) 40%, transparent)', background: 'color-mix(in srgb, var(--warn-text) 10%, var(--surface))' }}>
          {s.note ?? 'Index-only: this is the last indexed chain state, not a live query of a peer.'}
          {s.lastIndexedAt && <> Last indexed {formatDateTimeIST(s.lastIndexedAt)}.</>}
        </p>
      )}

      <Section title="Peers" aside={`${s.peers.filter((p) => p.up).length} of ${s.peers.length} up`}>
        <div className="scroll-x -mx-4 sm:-mx-5">
          <table className="dtable" data-testid="peers">
            <caption className="sr-only">Peers with status and block height per channel</caption>
            <thead><tr><th scope="col">Peer</th><th scope="col">Organisation</th><th scope="col">Status</th>{CHANNELS.map((c) => <th key={c} scope="col" className="text-right">{channelShort(c)} height</th>)}</tr></thead>
            <tbody>
              {s.peers.map((p) => (
                <tr key={p.name}>
                  <td className="mono">{p.name}</td>
                  <td><OrgBadge org={p.org} /></td>
                  <td><Chip tone={p.up ? 'ok' : 'danger'}>{p.up ? 'Up' : 'Down'}</Chip></td>
                  {CHANNELS.map((c) => {
                    const h = p.heights[c];
                    return <td key={c} className="text-right">{h === undefined ? <span className="text-ink-3" title="This organisation is not a member of this channel">not a member</span> : <span className="mono">{formatCount(h)}</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Orderers" aside="Raft: one leader per channel">
        <div className="scroll-x -mx-4 sm:-mx-5">
          <table className="dtable" data-testid="orderers">
            <caption className="sr-only">Orderers with Raft leadership</caption>
            <thead><tr><th scope="col">Orderer</th><th scope="col">Status</th><th scope="col">Raft role</th></tr></thead>
            <tbody>
              {s.orderers.map((o) => {
                const led = leaderOf(o);
                return (
                  <tr key={o.name}>
                    <td className="mono">{o.name}</td>
                    <td><Chip tone={o.up ? 'ok' : 'danger'}>{o.up ? 'Up' : 'Down'}</Chip></td>
                    <td>{led.length ? <span className="flex flex-wrap items-center gap-1.5"><Chip tone="accent">Leader</Chip><span className="text-sm text-ink-2">of {led.map(channelShort).join(' and ')}-channel</span></span> : <span className="text-ink-2">Follower</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line py-3 text-sm text-ink-2">
          {CHANNELS.map((c) => `${channelShort(c)}: ${leaders[c] ?? 'no leader reported'}`).join(' · ')}. The leader is elected per channel, so one orderer can lead several.
        </p>
      </Section>

      <Section title="Who is on which channel">
        <div className="scroll-x -mx-4 sm:-mx-5">
          <table className="dtable" data-testid="matrix">
            <caption className="sr-only">Organisations by channel membership</caption>
            <thead><tr><th scope="col">Organisation</th>{CHANNELS.map((c) => <th key={c} scope="col" className="text-center">{channelShort(c)}<span className="mono ml-1 normal-case text-ink-3">#{formatCount(heightOf(c) ?? 0)}</span></th>)}</tr></thead>
            <tbody>
              {ORGS.map((o) => (
                <tr key={o}>
                  <th scope="row" className="!text-left !normal-case !tracking-normal !text-ink font-normal">
                    <span className="flex flex-wrap items-center gap-2"><OrgBadge org={o} /><span className="hidden text-ink-2 sm:inline">{ORG_DISPLAY[o]}</span></span>
                  </th>
                  {CHANNELS.map((c) => {
                    const member = s.channels.find((x) => x.name === c)?.members.includes(o);
                    return (
                      <td key={c} className="text-center">
                        {member ? <><Check className="mx-auto h-4 w-4 text-ok" aria-hidden /><span className="sr-only">Member</span></>
                          : <><Minus className="mx-auto h-4 w-4 text-ink-3" aria-hidden /><span className="sr-only">Not a member</span></>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line py-4 text-sm text-ink-2">
          <h3 className="font-semibold text-ink">Why the Regulator has no seat on trade-channel</h3>
          <p className="mt-1 max-w-prose">
            Negotiated prices are commercial secrets between the FPO and the buyer, so trade-channel has only those two members. The monitoring cell sees the trace and finance channels, which is enough to check that lots exist, were graded and were pledged once. For a sale it sees only a hash of the price, never the price. This is how the ledger itself enforces what the observer may know, not a filter in this dashboard.
          </p>
        </div>
      </Section>
    </>
  );
}
