import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PortalFooter, ScreenHeader } from '../src/components/chrome';
import { Card, Chip, Page, Txt } from '../src/components/ui';
import { space } from '../src/theme';

const SURFACES = ['farmer', 'fpo', 'bank', 'buyer', 'consumer', 'gov'] as const;
const LABEL: Record<(typeof SURFACES)[number], string> = { farmer: 'Farmer app', fpo: 'FPO console', bank: 'Bank portal', buyer: 'Buyer portal', consumer: 'Consumer site', gov: 'Governance dashboard' };

export default function About() {
  const { t } = useTranslation();
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('about.title')} />
      <Page footer={<PortalFooter />}>
        <Txt>{t('about.body')}</Txt>
        <Card>
          <View style={{ gap: space.s2 }}>
            {SURFACES.map((s) => (
              <Chip key={s} label={LABEL[s]} tone={s === 'farmer' ? 'ok' : 'neutral'} />
            ))}
            <Txt v="mono">↓ one gateway (REST + SSE)</Txt>
            <Txt v="mono">↓ Hyperledger Fabric 2.5: 4 organisations, 3 channels (trace, finance, trade)</Txt>
          </View>
        </Card>
        <Txt v="small">{t('about.chain')}</Txt>
        <Txt v="label">{t('about.here')}</Txt>
      </Page>
    </View>
  );
}
