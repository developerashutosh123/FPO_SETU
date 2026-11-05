'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ChartPoint { label: string; avgC: number; window: string }

/** One point per anchored condition digest (average °C over its window). Points are what the ledger anchored; nothing is interpolated. */
export default function ColdChainChart({ points }: { points: ChartPoint[] }) {
  return (
    <div style={{ height: 240 }} role="img" aria-label={`Average temperature in ${points.length} anchored windows. The table below lists every value.`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--ink-2)' }} stroke="var(--line)" />
          <YAxis unit=" °C" width={64} tick={{ fontSize: 12, fill: 'var(--ink-2)' }} stroke="var(--line)" domain={['auto', 'auto']} />
          <Tooltip formatter={(v) => [`${String(v)} °C`, 'Average']} labelFormatter={(_, p) => (p?.[0]?.payload as ChartPoint | undefined)?.window ?? ''} />
          <Line type="monotone" dataKey="avgC" stroke="#24432F" strokeWidth={2} dot={{ r: 5, fill: '#A67C52', stroke: '#24432F', strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
