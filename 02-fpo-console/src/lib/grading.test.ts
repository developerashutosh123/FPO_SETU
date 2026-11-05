import { describe, expect, it } from 'vitest';
import type { QualityReading } from '@/contract/contract';
import { proposeGrade } from './grading';

const potato = (p: NonNullable<QualityReading['potato']>): QualityReading => ({ deviceId: 'QM-CHG-01', at: '2026-11-04T13:22:00Z', potato: p });
const paddy = (p: NonNullable<QualityReading['paddy']>): QualityReading => ({ deviceId: 'QM-CHG-01', at: '2026-11-04T13:22:00Z', paddy: p });

describe('proposeGrade', () => {
  it('grades the seeded lot reading A, as the ledger fixture has it', () => {
    // shared/fixtures/lots.json: 45-55 mm, greening 0.8, rot 0.4, cuts 1.2 -> lot 089012340000004517 is grade A
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '45-55', greeningPct: 0.8, rotPct: 0.4, cutsPct: 1.2 }))?.grade).toBe('A');
  });
  it('drops to B for small size or moderate defects, and to C beyond the B limits', () => {
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '35-45', greeningPct: 0.5, rotPct: 0.5, cutsPct: 0.5 }))?.grade).toBe('B');
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '>55', greeningPct: 2.5, rotPct: 0.5, cutsPct: 0.5 }))?.grade).toBe('B');
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '<35', greeningPct: 0.1, rotPct: 0.1, cutsPct: 0.1 }))?.grade).toBe('C');
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '>55', greeningPct: 0.1, rotPct: 2.5, cutsPct: 0.1 }))?.grade).toBe('C');
  });
  it('states that the potato rule is a demo rule, not an Indian standard', () => {
    expect(proposeGrade('POTATO', potato({ sizeGradeMm: '>55', greeningPct: 0, rotPct: 0, cutsPct: 0 }))?.rule).toMatch(/not an Indian standard/);
  });
  it('fails paddy outside the Government of India specification limits', () => {
    expect(proposeGrade('PADDY', paddy({ moisturePct: 17.5, foreignMatterPct: 0.5, brokenPct: 1 }))?.grade).toBe('C');
    expect(proposeGrade('PADDY', paddy({ moisturePct: 14, foreignMatterPct: 1.2, brokenPct: 1 }))?.grade).toBe('C');
    expect(proposeGrade('PADDY', paddy({ moisturePct: 14, foreignMatterPct: 0.5, brokenPct: 2 }))?.grade).toBe('A');
    expect(proposeGrade('PADDY', paddy({ moisturePct: 16, foreignMatterPct: 0.5, brokenPct: 2 }))?.grade).toBe('B');
  });
  it('returns null when the reading does not match the crop', () => {
    expect(proposeGrade('PADDY', potato({ sizeGradeMm: '>55', greeningPct: 0, rotPct: 0, cutsPct: 0 }))).toBeNull();
  });
});
