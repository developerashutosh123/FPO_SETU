import type { TextStyle } from 'react-native';

/** Farmer theme: potato-skin ochre on deep paddy green, paper canvas. Values mirror shared/design/tokens.css ([data-portal="farmer"]); src/theme.test.ts checks they still do. */
export const color = {
  ink: '#1B1F23', ink2: '#4A525A', ink3: '#7A838C', line: '#DDE1E5', surface: '#FFFFFF', canvas: '#FAF7F0',
  ok: '#1F7A3F', warn: '#A15C00', danger: '#B42318', info: '#1F5FA8',
  accent: '#1E4D2B', accent2: '#B5651D', accentInk: '#FFFFFF',
  okBg: '#E7F3EB', warnBg: '#FBEFD9', dangerBg: '#FBE7E4', infoBg: '#E6EEF8', accentBg: '#E8F0EA',
};
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, s7: 48 };
export const radius = { sm: 4, md: 6 };
/** The app never goes below 16 sp. Bengali primary content is 18 sp. */
export const size = { small: 16, body: 18, lg: 20, xl: 24, xxl: 30, money: 40 };

export const FONT_SANS = '"IBM Plex Sans","Noto Sans Bengali","Noto Sans Devanagari",system-ui,sans-serif';
export const FONT_MONO = '"IBM Plex Mono","Noto Sans Bengali","Noto Sans Devanagari",ui-monospace,monospace';
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };
export const MIN_TOUCH = 48;

export const statusTone: Record<string, 'ok' | 'warn' | 'danger' | 'info' | 'neutral'> = {
  PENDING_FARMER_SIGNATURE: 'warn', COMMISSIONED: 'info', GRADED: 'info', IN_STORAGE: 'info', PLEDGED: 'warn', LISTED: 'info', SOLD: 'info',
  IN_TRANSIT: 'info', DELIVERED: 'ok', SETTLED: 'ok', CLOSED: 'ok', TRANSFORMED: 'neutral', REJECTED: 'danger', UNVERIFIABLE: 'danger',
};
