import '../src/i18n';
import { Slot, usePathname, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ActivityToasts, LedgerStatusPill, OfflineBanner } from '../src/components/chrome';
import { Chip, Row, Txt } from '../src/components/ui';
import { hasChosenLang } from '../src/i18n';
import { LiveProvider } from '../src/lib/live';
import { SessionProvider, useSession } from '../src/lib/session';
import { color, space } from '../src/theme';

const OPEN_ROUTES = new Set(['language', 'about', 'credits']);

function Shell() {
  const { user } = useSession();
  const { t, i18n } = useTranslation();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const first = (segments[0] as string | undefined) ?? '';

  // First launch asks for a language; everything except a few open pages needs a signed-in farmer. The page the person was heading to is kept in `next`.
  const needLang = !hasChosenLang() && !OPEN_ROUTES.has(first);
  const needLogin = !needLang && !user && first !== 'login' && !OPEN_ROUTES.has(first);
  useEffect(() => {
    const next = pathname && pathname !== '/' && pathname !== '/language' ? `?next=${encodeURIComponent(pathname)}` : '';
    if (needLang) router.replace(`/language${next}`);
    else if (needLogin) router.replace(`/login${next}`);
  }, [needLang, needLogin, pathname, router]);

  useEffect(() => { if (typeof document !== 'undefined') document.documentElement.lang = i18n.language; }, [i18n.language]);

  const framed = width >= 700;
  return (
    <View style={{ flex: 1, backgroundColor: framed ? '#EFEADD' : color.canvas, alignItems: 'center' }}>
      <View
        style={{
          flex: 1, width: '100%', maxWidth: 480, backgroundColor: color.canvas, overflow: 'hidden',
          ...(framed ? { marginVertical: space.s4, maxHeight: Math.min(height - 32, 900), borderWidth: 1, borderColor: color.line, borderRadius: 14 } : {}),
        }}
      >
        <View style={{ backgroundColor: color.surface, paddingHorizontal: space.s4, paddingTop: space.s2, borderBottomWidth: 1, borderColor: color.line }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row style={{ gap: space.s2 }}>
              <Txt v="lg" style={{ color: color.accent }}>{t('app.name')}</Txt>
              <Chip label={t('app.webDemo')} tone="warn" />
            </Row>
          </Row>
          <View style={{ paddingBottom: space.s2 }}><LedgerStatusPill /></View>
        </View>
        <OfflineBanner />
        <View style={{ flex: 1 }}>{needLang || needLogin ? null : <Slot />}</View>
        <ActivityToasts />
      </View>
      <StatusBar style="light" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <LiveProvider>
        <Shell />
      </LiveProvider>
    </SessionProvider>
  );
}
