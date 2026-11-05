import { useSyncExternalStore } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Languages, WifiOff, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { FOOTER_TEXT, type Commodity } from '../contract/contract';
import { LANGS, setLang } from '../i18n';
import { getConn, subscribeConn } from '../lib/api';
import { useLive } from '../lib/live';
import { color, MIN_TOUCH, radius, shadow, space } from '../theme';
import { Row, Txt } from './ui';
import { Carrot, Sprout, Wheat } from 'lucide-react-native';

export const useConn = () => useSyncExternalStore(subscribeConn, getConn, getConn);

const n = (x: number) => new Intl.NumberFormat('en-IN').format(x);

/** Ledger status pill (CONTRACT.md section 9.3): live heights, amber index-only, red offline. */
export function LedgerStatusPill() {
  const { t } = useTranslation();
  const c = useConn();
  const h = c.health?.channels;
  const heights = h ? ` · trace #${n(h['trace-channel']?.height ?? 0)} · finance #${n(h['finance-channel']?.height ?? 0)} · trade #${n(h['trade-channel']?.height ?? 0)}` : '';
  const tone = c.mode === 'live' ? color.ok : c.mode === 'index-only' ? color.warn : color.danger;
  const label = c.mode === 'live' ? t('pill.live') : c.mode === 'index-only' ? t('pill.index') : t('pill.offline');
  return (
    <Row style={{ gap: space.s2, flexWrap: 'wrap' }} accessibilityRole="text" testID="ledger-pill">
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone }} />
      <Txt v="small" style={{ color: tone, fontWeight: '700' }}>{label}</Txt>
      {c.mode !== 'offline' ? <Txt v="mono">{heights.replace(/^ · /, '')}</Txt> : null}
    </Row>
  );
}

/** "The ledger node is asleep..." (CONTRACT.md section 9.3). Write buttons elsewhere read `useWritesPaused()`. */
export const useWritesPaused = () => useConn().mode !== 'live';
export function OfflineBanner() {
  const { t } = useTranslation();
  const c = useConn();
  if (c.mode === 'live') return null;
  const off = c.mode === 'offline';
  return (
    <Row style={{ backgroundColor: off ? color.dangerBg : color.warnBg, paddingHorizontal: space.s4, paddingVertical: space.s3, borderBottomWidth: 1, borderColor: off ? color.danger : color.warn, alignItems: 'flex-start' }} accessibilityRole="alert" testID="offline-banner">
      <WifiOff color={off ? color.danger : color.warn} size={22} />
      <Txt v="small" style={{ flex: 1, color: color.ink }}>{off ? t('banner.offline') : t('banner.indexOnly')}</Txt>
    </Row>
  );
}

export function LanguageSwitch() {
  const { i18n, t } = useTranslation();
  return (
    <Row style={{ gap: space.s2, flexWrap: 'wrap' }} accessibilityLabel={t('common.language')}>
      <Languages color={color.ink2} size={22} />
      {LANGS.map((l) => {
        const on = i18n.language === l.code;
        return (
          <Pressable key={l.code} onPress={() => setLang(l.code)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={l.native}
            style={{ minHeight: MIN_TOUCH, minWidth: 64, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s4, borderRadius: radius.pill, borderWidth: 2, borderColor: on ? color.accent : color.line, backgroundColor: on ? color.accent : color.surface }}>
            <Txt v="small" style={{ color: on ? color.accentInk : color.ink, fontWeight: '700' }}>{l.native}</Txt>
          </Pressable>
        );
      })}
    </Row>
  );
}

export function ActivityToasts() {
  const { toasts, dismiss } = useLive();
  const { t } = useTranslation();
  if (!toasts.length) return null;
  return (
    <View style={{ position: 'absolute', left: space.s3, right: space.s3, bottom: space.s4, gap: space.s2, zIndex: 50 }} pointerEvents="box-none" accessibilityLiveRegion="polite">
      {toasts.map((x) => (
        <Row key={x.id} style={[{ backgroundColor: color.accent, borderRadius: radius.lg, padding: space.s4, alignItems: 'flex-start', boxShadow: '0 8px 24px -6px rgba(16,24,40,0.35)' }]} testID="toast">
          <View style={{ flex: 1 }}>
            <Txt style={{ color: color.accentInk, fontWeight: '600' }}>{x.text}</Txt>
            <Txt v="mono" style={{ color: '#DCE8DF' }}>tx {x.txId.slice(0, 8)}…</Txt>
          </View>
          <Pressable onPress={() => dismiss(x.id)} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <X color={color.accentInk} size={22} />
          </Pressable>
        </Row>
      ))}
    </View>
  );
}

export function PortalFooter() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={{ gap: space.s2, marginTop: space.s5, paddingTop: space.s4, borderTopWidth: 1, borderColor: color.line }} testID="footer">
      <Txt v="small">{FOOTER_TEXT}</Txt>
      <Row>
        <Pressable onPress={() => router.push('/about')} accessibilityRole="link" style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}><Txt v="small" style={{ color: color.accent, textDecorationLine: 'underline' }}>{t('about.title')}</Txt></Pressable>
        <Pressable onPress={() => router.push('/credits')} accessibilityRole="link" style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}><Txt v="small" style={{ color: color.accent, textDecorationLine: 'underline' }}>{t('credits.title')}</Txt></Pressable>
      </Row>
    </View>
  );
}

export function ScreenHeader({ title, back = true, right }: { title: string; back?: boolean; right?: React.ReactNode }) {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <Row style={{ backgroundColor: color.accent, paddingHorizontal: space.s2, minHeight: 64 }}>
      {back ? (
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} accessibilityRole="button" accessibilityLabel={t('common.back')} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft color={color.accentInk} size={26} />
        </Pressable>
      ) : <View style={{ width: space.s2 }} />}
      <Txt v="lg" accessibilityRole="header" style={{ color: color.accentInk, flex: 1 }}>{title}</Txt>
      {right}
    </Row>
  );
}

export function CropIcon({ commodity, size = 28, tint = color.accent }: { commodity?: Commodity; size?: number; tint?: string }) {
  if (commodity === 'PADDY') return <Wheat color={tint} size={size} />;
  if (commodity === 'POTATO') return <Sprout color={tint} size={size} />;
  return <Carrot color={tint} size={size} />;
}

export const openExternal = (url: string) => void Linking.openURL(url);
