import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Card, Page, Txt } from '../src/components/ui';
import { PortalFooter } from '../src/components/chrome';

export default function NotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Page footer={<PortalFooter />}>
      <Card>
        <Txt v="xl">{t('errors.ERR_NOT_FOUND')}</Txt>
        <Button label={t('common.home')} onPress={() => router.replace('/home')} />
      </Card>
    </Page>
  );
}
