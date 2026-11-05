import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch, PortalFooter, ScreenHeader } from '../src/components/chrome';
import { Button, Card, Page, Txt } from '../src/components/ui';
import { ORG_DISPLAY } from '../src/contract/contract';
import { useAsync } from '../src/hooks/useAsync';
import { useVillageName } from '../src/hooks/useVillages';
import { api } from '../src/lib/api';
import { useSession } from '../src/lib/session';
import { color } from '../src/theme';

export default function Profile() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useSession();
  const me = useAsync((s) => api.me(s), []);
  const village = useVillageName(me.data?.village, i18n.language);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('profile.title')} />
      <Page footer={<PortalFooter />}>
        <Card>
          <Txt v="label">{t('profile.token')}</Txt>
          <Txt v="mono" style={{ color: color.ink, fontSize: 18 }} testID="member-token">{me.data?.farmerToken ?? '…'}</Txt>
          <Txt v="small">{t('profile.tokenNote')}</Txt>
        </Card>
        <Card>
          <Txt v="label">{t('profile.fpo')}</Txt>
          <Txt>{user ? ORG_DISPLAY[user.org] : ''}</Txt>
          <Txt v="label">{t('profile.village')}</Txt>
          <Txt>{village ?? me.data?.village ?? '…'}</Txt>
        </Card>
        <Card><Txt v="label">{t('common.language')}</Txt><LanguageSwitch /></Card>
        <Button variant="secondary" label={t('common.logout')} icon={<LogOut color={color.accent} size={22} />} onPress={() => { signOut(); router.replace('/login'); }} testID="logout" />
      </Page>
    </View>
  );
}
