import { describe, expect, it } from 'vitest';
import type { Role } from '@/contract/contract';
import { canOpen, isFpoRole, navFor } from './access';

describe('role guard', () => {
  it('lets only the CEO into orders and collateral, and only the operator into intake', () => {
    for (const path of ['/orders', '/orders/ORD-2026-00091', '/collateral', '/collateral/ENWR-NERL-2026-004211']) {
      expect(canOpen('ceo', path)).toBe(true);
      for (const r of ['operator', 'warehouse', 'vle'] as Role[]) expect(canOpen(r, path)).toBe(false);
    }
    expect(canOpen('operator', '/intake')).toBe(true);
    for (const r of ['ceo', 'warehouse', 'vle'] as Role[]) expect(canOpen(r, '/intake')).toBe(false);
  });
  it('gives every FPO role Today and Lots, and nobody from another org any page', () => {
    for (const r of ['ceo', 'operator', 'warehouse', 'vle'] as Role[]) { expect(canOpen(r, '/')).toBe(true); expect(canOpen(r, '/lots/089012340000004517')).toBe(true); }
    for (const r of ['credit_officer', 'buyer_manager', 'observer', 'member'] as Role[]) { expect(isFpoRole(r)).toBe(false); }
  });
  it('does not match a path that merely starts with a guarded prefix', () => {
    expect(canOpen('operator', '/ordersx')).toBe(false);
    expect(canOpen('operator', '/unknown')).toBe(false);
  });
  it('shows each role only the menu entries it can open', () => {
    expect(navFor('operator').map((n) => n.label)).toEqual(['Today', 'Intake', 'Lots']);
    expect(navFor('ceo').map((n) => n.label)).toEqual(['Today', 'Lots', 'Orders', 'Collateral']);
    expect(navFor('warehouse').map((n) => n.label)).toEqual(['Today', 'Lots']);
  });
});
