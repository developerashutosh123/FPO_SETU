import type { Commodity, VillageCode } from '@/contract/contract';

export const COMMODITIES: { value: Commodity; label: string }[] = [
  { value: 'POTATO', label: 'Potato' }, { value: 'PADDY', label: 'Paddy' }, { value: 'BRINJAL', label: 'Brinjal' }, { value: 'CAULIFLOWER', label: 'Cauliflower' },
];
export const commodityLabel = (c: Commodity) => COMMODITIES.find((x) => x.value === c)?.label ?? c;

/** Fallback names when GET /villages is unavailable. The API's own village list (with block and coordinates) wins. */
export const VILLAGE_CODES: VillageCode[] = ['CHANGUAL', 'GOLGRAM', 'GOPALPUR', 'SANKOA', 'DUAN'];
export const villageFallbackName = (c: string) => c.charAt(0) + c.slice(1).toLowerCase();
