import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PortalFooter, ScreenHeader } from '../src/components/chrome';
import { Page, Txt } from '../src/components/ui';

export default function Credits() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('credits.title')} />
      <Page footer={<PortalFooter />}><Txt>{t('credits.body')}</Txt></Page>
    </View>
  );
}
