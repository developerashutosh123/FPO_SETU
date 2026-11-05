import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewProps, type ViewStyle } from 'react-native';
import { color, FONT_MONO, FONT_SANS, MIN_TOUCH, radius, shadow, size, space, TABULAR } from '../theme';

type Variant = 'body' | 'small' | 'title' | 'lg' | 'xl' | 'money' | 'mono' | 'label';
const variants: Record<Variant, TextStyle> = {
  body: { fontSize: size.body, lineHeight: 28, color: color.ink },
  small: { fontSize: size.small, lineHeight: 24, color: color.ink2 },
  label: { fontSize: size.small, lineHeight: 22, color: color.ink2, fontWeight: '600' },
  lg: { fontSize: size.lg, lineHeight: 30, color: color.ink, fontWeight: '600' },
  xl: { fontSize: size.xl, lineHeight: 34, color: color.ink, fontWeight: '700' },
  title: { fontSize: size.xxl, lineHeight: 40, color: color.accent, fontWeight: '700', letterSpacing: -0.3 },
  money: { fontSize: size.money, lineHeight: 52, color: color.accent, fontWeight: '800', ...TABULAR },
  mono: { fontSize: size.small, lineHeight: 24, color: color.ink2, fontFamily: FONT_MONO },
};
export function Txt({ v = 'body', style, children, ...rest }: { v?: Variant; style?: StyleProp<TextStyle>; children?: ReactNode } & Omit<TextProps, 'style'>) {
  return <Text {...rest} style={[{ fontFamily: FONT_SANS }, variants[v], style]}>{children}</Text>;
}
/** Money and other figures: bold tabular numerals. */
export function Num({ children, style, v = 'lg', ...rest }: { children: ReactNode; style?: StyleProp<TextStyle>; v?: Variant } & Omit<TextProps, 'style'>) {
  return <Txt v={v} {...rest} style={[{ fontWeight: '700' }, TABULAR, style]}>{children}</Txt>;
}

export function Card({ children, style, tone, ...rest }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'warn' | 'ok' | 'info' | 'accent' } & Omit<ViewProps, 'style'>) {
  const bg = tone === 'warn' ? color.warnBg : tone === 'ok' ? color.okBg : tone === 'info' ? color.infoBg : tone === 'accent' ? color.accentBg : color.surface;
  const bd = tone === 'warn' ? color.warn : tone === 'ok' ? color.ok : tone === 'info' ? color.info : tone === 'accent' ? color.accent : color.line;
  return <View {...rest} style={[styles.card, tone ? null : shadow, { backgroundColor: bg, borderColor: bd }, style]}>{children}</View>;
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }) {
  const fg = { ok: color.ok, warn: color.warn, danger: color.danger, info: color.info, neutral: color.ink2 }[tone];
  const bg = { ok: color.okBg, warn: color.warnBg, danger: color.dangerBg, info: color.infoBg, neutral: color.canvas }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg, borderColor: fg }]}>
      <Txt v="label" style={{ color: fg }}>{label}</Txt>
    </View>
  );
}

export function Button({ label, onPress, icon, variant = 'primary', disabled, busy, big, testID, hint }: {
  label: string; onPress: () => void; icon?: ReactNode; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; busy?: boolean; big?: boolean; testID?: string; hint?: string;
}) {
  const off = disabled || busy;
  const bg = variant === 'primary' ? color.accent : variant === 'danger' ? color.surface : 'transparent';
  const fg = variant === 'primary' ? color.accentInk : variant === 'danger' ? color.danger : color.accent;
  const bd = variant === 'ghost' ? 'transparent' : variant === 'danger' ? color.danger : color.accent;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: !!off, busy: !!busy }} testID={testID}
      disabled={!!off} onPress={off ? undefined : onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, borderColor: bd, minHeight: big ? 68 : MIN_TOUCH + 8, opacity: off ? 0.5 : pressed ? 0.88 : 1 }, variant === 'primary' && !off ? shadow : null]}
    >
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <Txt v={big ? 'lg' : 'body'} style={{ color: fg, fontWeight: '700', flexShrink: 1, textAlign: 'center' }}>{label}</Txt>
    </Pressable>
  );
}

export function Row({ children, style, ...rest }: { children: ReactNode; style?: StyleProp<ViewStyle> } & Omit<ViewProps, 'style'>) {
  return <View {...rest} style={[{ flexDirection: 'row', alignItems: 'center', gap: space.s3 }, style]}>{children}</View>;
}

/** Skeleton block for loading states (no default spinner). */
export function Skeleton({ h = 20, w = '100%', style }: { h?: number; w?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  return <View accessibilityElementsHidden style={[{ height: h, width: w, backgroundColor: color.line, borderRadius: radius.md, opacity: 0.6 }, style]} />;
}
export function CardSkeleton() {
  return (
    <Card>
      <Skeleton h={22} w="60%" />
      <Skeleton h={16} w="40%" style={{ marginTop: space.s3 }} />
      <Skeleton h={32} w="35%" style={{ marginTop: space.s3 }} />
    </Card>
  );
}

export function Page({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.canvas }} contentContainerStyle={{ padding: space.s4, gap: space.s4, paddingBottom: space.s7, width: '100%', maxWidth: 640, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
      {children}
      {footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space.s5, gap: space.s3 },
  chip: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.s3, paddingVertical: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s3, borderWidth: 2, borderRadius: radius.lg, paddingHorizontal: space.s5, paddingVertical: space.s3 },
});
