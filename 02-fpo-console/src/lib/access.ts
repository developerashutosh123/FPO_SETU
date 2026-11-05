import type { Role } from '@/contract/contract';

/** Roles that may sign in to this portal (contract section 5: the FPO org, minus the board, who use the gov dashboard). */
export const FPO_ROLES: Role[] = ['ceo', 'operator', 'warehouse', 'vle'];
export const isFpoRole = (r: Role) => FPO_ROLES.includes(r);

/** Which roles the gateway lets call the endpoints each page depends on. The gateway still enforces this; the UI just does not offer dead ends. */
export const PAGE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: '/intake', roles: ['operator'] },
  { prefix: '/orders', roles: ['ceo'] },
  { prefix: '/collateral', roles: ['ceo'] },
  { prefix: '/lots', roles: ['ceo', 'operator', 'warehouse', 'vle'] },
  { prefix: '/', roles: ['ceo', 'operator', 'warehouse', 'vle'] },
];

export function canOpen(role: Role, pathname: string): boolean {
  const hit = PAGE_ROLES.find((p) => (p.prefix === '/' ? pathname === '/' : pathname === p.prefix || pathname.startsWith(`${p.prefix}/`)));
  return hit ? hit.roles.includes(role) : false;
}

export const NAV_ITEMS = [
  { href: '/', label: 'Today' },
  { href: '/intake', label: 'Intake' },
  { href: '/lots', label: 'Lots' },
  { href: '/orders', label: 'Orders' },
  { href: '/collateral', label: 'Collateral' },
] as const;
export const navFor = (role: Role) => NAV_ITEMS.filter((n) => canOpen(role, n.href));

export const ROLE_LABEL: Partial<Record<Role, string>> = { ceo: 'CEO', operator: 'Operator', warehouse: 'Warehouse clerk', vle: 'VLE' };
