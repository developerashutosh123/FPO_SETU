import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PortalFooter } from '../src/components/chrome';
import { Card, Page, Txt } from '../src/components/ui';
import { LANGS, setLang } from '../src/i18n';
import { useSession } from '../src/lib/session';
import { color, space } from '../src/theme';

export default function LanguagePicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const dest = typeof next === 'string' && next.startsWith('/') ? next : null;
  return (
    <Page footer={<PortalFooter />}>
      <Txt v="title" accessibilityRole="header">{t('lang.title')}</Txt>
      <Txt v="small">{t('lang.sub')}</Txt>
      {LANGS.map((l) => (
        <Pressable key={l.code} accessibilityRole="button" accessibilityLabel={l.native} testID={`lang-${l.code}`}
          onPress={() => { setLang(l.code); router.replace(user ? (dest ?? '/home') : dest ? `/login?next=${encodeURIComponent(dest)}` : '/login'); }}>
          <Card style={{ minHeight: 88, justifyContent: 'center', borderColor: color.accent, borderWidth: 2, paddingVertical: space.s5 }}>
            <Txt v="xl" style={{ color: color.accent }}>{l.native}</Txt>
          </Card>
        </Pressable>
      ))}
    </Page>
  );
}
