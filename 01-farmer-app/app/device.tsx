import { useLocalSearchParams, useRouter } from 'expo-router';
import { PenLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { PortalFooter } from '../src/components/chrome';
import { Button, Card, Page, Txt } from '../src/components/ui';
import { color } from '../src/theme';

/** Shown once, right after the signing key is made on this phone. */
export default function DeviceKeyIntro() {
  const { t } = useTranslation();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  return (
    <Page footer={<PortalFooter />}>
      <Card tone="accent" style={{ alignItems: 'flex-start', gap: 12 }}>
        <PenLine color={color.accent} size={44} />
        <Txt v="title" accessibilityRole="header">{t('device.title')}</Txt>
        <Txt>{t('device.body')}</Txt>
      </Card>
      <Button big label={t('device.ok')} onPress={() => router.replace(typeof next === 'string' && next.startsWith('/') ? next : '/home')} testID="device-ok" />
    </Page>
  );
}
