import type { OrgMsp } from '../contract/contract.js';

/** A Fabric identity by name. Kept apart from identities.ts (which loads keys with the Fabric SDK) so the read-only API can use the type without the SDK. */
export interface FabricUser { username: string; msp: OrgMsp }
