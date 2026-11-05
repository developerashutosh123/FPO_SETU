import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CropIcon, PortalFooter, ScreenHeader } from '../../src/components/chrome';
import { Card, CardSkeleton, Button, Num, Page, Row, Txt } from '../../src/components/ui';
import { useAsync } from '../../src/hooks/useAsync';
import { api } from '../../src/lib/api';
import { formatINR, formatKg, formatPlainDate } from '../../src/lib/format';
import { commodityFromRef } from '../../src/lib/statementScript';
import { color } from '../../src/theme';

export default function StatementList() {
  const { t } = useTranslation();
  const router = useRouter();
  const st = useAsync((s) => api.statements(s), []);
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('statement.listTitle')} />
      <Page footer={<PortalFooter />}>
        {st.loading && !st.data ? <CardSkeleton /> : null}
        {st.error && !st.data ? <Card tone="warn"><Txt>{t(`errors.${st.error.code}`, { defaultValue: t('errors.UNKNOWN') })}</Txt><Button label={t('common.retry')} onPress={st.reload} /></Card> : null}
        {st.data && st.data.items.length === 0 ? <Card><Txt v="xl">{t('statement.emptyTitle')}</Txt><Txt>{t('statement.emptyBody')}</Txt></Card> : null}
        {st.data?.items.map((s) => {
          const crop = commodityFromRef(s.humanRef);
          return (
            <Pressable key={s.sscc} onPress={() => router.push(`/statement/${s.sscc}`)} accessibilityRole="button" testID={`statement-row-${s.sscc}`}>
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row><CropIcon commodity={crop} /><Txt v="xl">{crop ? t(`crop.${crop}`) : t('lot.title')}</Txt></Row>
                  <ChevronRight color={color.ink2} size={24} />
                </Row>
                <Txt v="mono">{s.humanRef}</Txt>
                <Txt v="small">{formatKg(s.kg)} {t('common.kg')} · {t('grade', { g: s.grade })}{s.paidOn ? ` · ${formatPlainDate(s.paidOn)}` : ''}</Txt>
                <Txt v="label">{t('home.netCredit')}</Txt>
                <Num v="money">{formatINR(s.net)}</Num>
              </Card>
            </Pressable>
          );
        })}
      </Page>
    </View>
  );
}
