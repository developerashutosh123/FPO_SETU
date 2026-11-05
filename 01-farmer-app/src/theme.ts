import type { TextStyle } from 'react-native';

/** Farmer theme: potato-skin ochre on deep paddy green, paper canvas. Values mirror shared/design/tokens.css ([data-portal="farmer"]); src/theme.test.ts checks they still do. */
export const color = {
  ink: '#15181C', ink2: '#444C56', ink3: '#5B6470', line: '#E2E5E9', surface: '#FFFFFF', canvas: '#FAF7F0',
  ok: '#17703A', warn: '#9A5700', danger: '#B42318', info: '#1D5A9E',
  accent: '#1E4D2B', accent2: '#B5651D', accentInk: '#FFFFFF',
  okBg: '#E6F3EA', warnBg: '#FCF1DC', dangerBg: '#FCE9E6', infoBg: '#E7EFF9', accentBg: '#E8F0EA',
};
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48 };
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
/** Soft elevation for cards and buttons (react-native-web renders this as CSS box-shadow). */
export const shadow = { boxShadow: '0 1px 2px rgba(16,24,40,0.05), 0 6px 16px -6px rgba(16,24,40,0.12)' } as const;
/** The app never goes below 16 sp. Bengali primary content is 18 sp. */
export const size = { small: 16, body: 18, lg: 20, xl: 24, xxl: 30, money: 40 };

export const FONT_SANS = '"Inter","Noto Sans Bengali","Noto Sans Devanagari",system-ui,sans-serif';
export const FONT_MONO = '"IBM Plex Mono","Noto Sans Bengali","Noto Sans Devanagari",ui-monospace,monospace';
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
export const MIN_TOUCH = 48;

export const statusTone: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  PENDING_FARMER_SIGNATURE: 'warn', COMMISSIONED: 'info', GRADED: 'info', IN_STORAGE: 'info', PLEDGED: 'warn', LISTED: 'info', SOLD: 'info',
  IN_TRANSIT: 'info', DELIVERED: 'ok', SETTLED: 'ok', CLOSED: 'ok', TRANSFORMED: 'neutral', REJECTED: 'danger', UNVERIFIABLE: 'danger',
};
