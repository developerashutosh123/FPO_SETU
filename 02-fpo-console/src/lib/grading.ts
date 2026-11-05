import type { Commodity, Grade, QualityReading } from '@/contract/contract';

export interface GradeProposal { grade: Grade; rule: string; checks: { label: string; ok: boolean }[] }

/**
 * Grade suggested to the operator from the quality-meter reading. The operator confirms or overrides it; the chaincode records
 * whichever grade is submitted and does not recompute it.
 *
 * Provenance of the thresholds (00-core-ledger/docs/DATA_SOURCES.md):
 *  - paddy moisture <= 17.0 % and foreign matter <= 1.0 %: Government of India uniform specification for paddy (SOURCED). Failing either gives C.
 *  - every other threshold (potato size, greening, rot, cuts; paddy A/B split; vegetables): DEMO PARAMETERS. No Indian grade standard with
 *    these tolerances could be retrieved (DATA_SOURCES marks potato tolerances as a GAP). The UI says so next to the rule.
 */
export function proposeGrade(commodity: Commodity, q: QualityReading): GradeProposal | null {
  if (commodity === 'POTATO' && q.potato) {
    const p = q.potato;
    const bigEnough = p.sizeGradeMm === '>55' || p.sizeGradeMm === '45-55';
    const midEnough = bigEnough || p.sizeGradeMm === '35-45';
    const a = [
      { label: `size ${p.sizeGradeMm} mm is 45 mm or larger`, ok: bigEnough },
      { label: `greening ${p.greeningPct}% is at most 1%`, ok: p.greeningPct <= 1 },
      { label: `rot ${p.rotPct}% is at most 1%`, ok: p.rotPct <= 1 },
      { label: `cuts ${p.cutsPct}% is at most 2%`, ok: p.cutsPct <= 2 },
    ];
    const b = [
      { label: `size ${p.sizeGradeMm} mm is 35 mm or larger`, ok: midEnough },
      { label: `greening ${p.greeningPct}% is at most 3%`, ok: p.greeningPct <= 3 },
      { label: `rot ${p.rotPct}% is at most 2%`, ok: p.rotPct <= 2 },
      { label: `cuts ${p.cutsPct}% is at most 3%`, ok: p.cutsPct <= 3 },
    ];
    const rule = 'Demo rule, not an Indian standard. A: size 45 mm or larger, greening and rot at most 1%, cuts at most 2%. B: size 35 mm or larger, greening at most 3%, rot at most 2%, cuts at most 3%. Otherwise C.';
    if (a.every((c) => c.ok)) return { grade: 'A', rule, checks: a };
    if (b.every((c) => c.ok)) return { grade: 'B', rule, checks: b };
    return { grade: 'C', rule, checks: b };
  }
  if (commodity === 'PADDY' && q.paddy) {
    const p = q.paddy;
    const spec = [
      { label: `moisture ${p.moisturePct}% is at most 17.0% (Government of India uniform specification)`, ok: p.moisturePct <= 17 },
      { label: `foreign matter ${p.foreignMatterPct}% is at most 1.0% (same specification)`, ok: p.foreignMatterPct <= 1 },
    ];
    const rule = 'C if moisture is above 17.0% or foreign matter above 1.0% (Government of India uniform specification for paddy). A needs moisture at most 15% and broken grain at most 3% (demo parameters). Otherwise B.';
    if (!spec.every((c) => c.ok)) return { grade: 'C', rule, checks: spec };
    const a = [
      { label: `moisture ${p.moisturePct}% is at most 15%`, ok: p.moisturePct <= 15 },
      { label: `broken grain ${p.brokenPct}% is at most 3%`, ok: p.brokenPct <= 3 },
    ];
    return { grade: a.every((c) => c.ok) ? 'A' : 'B', rule, checks: [...spec, ...a] };
  }
  if (q.vegetable) {
    const v = q.vegetable;
    const a = [
      { label: `uniformity ${v.uniformityPct}% is at least 90%`, ok: v.uniformityPct >= 90 },
      { label: `damage ${v.damagePct}% is at most 5%`, ok: v.damagePct <= 5 },
    ];
    const rule = 'Demo rule, not an Indian standard. A: uniformity at least 90% and damage at most 5%. B: damage at most 10%. Otherwise C.';
    if (a.every((c) => c.ok)) return { grade: 'A', rule, checks: a };
    if (v.damagePct <= 10) return { grade: 'B', rule, checks: [{ label: `damage ${v.damagePct}% is at most 10%`, ok: true }] };
    return { grade: 'C', rule, checks: [{ label: `damage ${v.damagePct}% is above 10%`, ok: false }] };
  }
  return null;
}
