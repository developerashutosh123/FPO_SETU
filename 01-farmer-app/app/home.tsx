import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, FileText, PenLine, User } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CropIcon, LanguageSwitch, PortalFooter } from '../src/components/chrome';
import { Button, Card, CardSkeleton, Chip, Num, Page, Row, Txt } from '../src/components/ui';
import { useAsync } from '../src/hooks/useAsync';
import { api } from '../src/lib/api';
import { formatINR, formatKg, formatPlainDate } from '../src/lib/format';
import { getDeclined } from '../src/lib/declined';
import { useLive } from '../src/lib/live';
import { loadMyLots, type MyLot } from '../src/lib/myLots';
import { color, space, statusTone } from '../src/theme';

function LotCard({ lot, onOpen, onStatement }: { lot: MyLot; onOpen: () => void; onStatement: () => void }) {
  const { t } = useTranslation();
  const paid = lot.statement;
  return (
    <Card testID={`lot-card-${lot.sscc}`}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${lot.commodity ? t(`crop.${lot.commodity}`) : t('lot.title')} ${lot.humanRef}`} style={{ gap: space.s2, minHeight: 48 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <CropIcon commodity={lot.commodity} />
            <Txt v="xl">{lot.commodity ? t(`crop.${lot.commodity}`) : t('lot.title')}</Txt>
          </Row>
          <ChevronRight color={color.ink2} size={24} />
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          {lot.status ? <Chip label={t(`status.${lot.status}`)} tone={statusTone[lot.status] ?? 'neutral'} /> : null}
          {lot.grade ? <Chip label={t('grade', { g: lot.grade })} tone="ok" /> : null}
          {lot.kg != null ? <Num v="body">{formatKg(lot.kg)} {t('common.kg')}</Num> : null}
          {lot.bags != null ? <Txt v="small">· {t('common.bags', { n: lot.bags })}</Txt> : null}
        </Row>
        <Txt v="mono">{lot.humanRef}</Txt>
        {paid ? (
          <View>
            <Txt v="label">{t('home.netCredit')}</Txt>
            <Num v="money" style={{ color: color.accent }}>{formatINR(paid.net)}</Num>
            {paid.paidOn ? <Txt v="small">{formatPlainDate(paid.paidOn)}</Txt> : null}
          </View>
        ) : null}
      </Pressable>
      {paid ? <Button variant="secondary" label={t('home.seeStatement')} icon={<FileText color={color.accent} size={22} />} onPress={onStatement} testID={`open-statement-${lot.sscc}`} /> : null}
    </Card>
  );
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { watch } = useLive();
  const me = useAsync((s) => api.me(s), []);
  const lots = useAsync((s) => loadMyLots(s), []);
  const [declined, setDeclined] = useState<string[]>([]);
  useEffect(() => { setDeclined(getDeclined()); }, [lots.data]);

  useEffect(() => { if (lots.data) watch(lots.data.lots.map((l) => ({ sscc: l.sscc, humanRef: l.humanRef }))); }, [lots.data, watch]);

  const waiting = useMemo(() => (lots.data?.drafts ?? []).filter((d) => !declined.includes(d.sscc)), [lots.data, declined]);
  const shown = useMemo(() => (lots.data?.lots ?? []).filter((l) => !(l.draft && declined.includes(l.sscc))), [lots.data, declined]);
  const totalKg = (lots.data?.statements ?? []).reduce((a, s) => a + s.kg, 0);
  const totalPaid = (lots.data?.statements ?? []).reduce((a, s) => a + s.net, 0);
  const name = me.data ? (i18n.language === 'en' ? me.data.name : me.data.nameLocal) : '';

  return (
    <Page footer={<PortalFooter />}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="title" accessibilityRole="header" style={{ flex: 1 }}>{name ? t('home.hello', { name }) : t('home.myLots')}</Txt>
        <Pressable onPress={() => router.push('/profile')} accessibilityRole="button" accessibilityLabel={t('common.profile')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }} testID="open-profile">
          <User color={color.accent} size={28} />
        </Pressable>
      </Row>

      <LanguageSwitch />

      {waiting.length > 0 ? (
        <Card tone="warn" testID="waiting-card">
          <Row><PenLine color={color.warn} size={26} /><Txt v="xl" style={{ flex: 1 }}>{t('home.waitingTitle')}</Txt></Row>
          <Txt>{waiting.length === 1 ? t('home.waitingOne') : t('home.waitingMany', { n: waiting.length })}</Txt>
          {waiting.map((d) => (
            <View key={d.sscc} style={{ gap: space.s2, marginTop: space.s2 }}>
              <Txt v="lg">{t(`crop.${d.commodity}`)} · {t('common.bags', { n: d.bagCount })} · {formatKg(d.estWeightKg)} {t('common.kg')}</Txt>
              <Button label={t('home.confirmNow')} icon={<PenLine color={color.accentInk} size={22} />} onPress={() => router.push(`/confirm/${d.sscc}`)} testID={`confirm-${d.sscc}`} />
            </View>
          ))}
        </Card>
      ) : null}

      {lots.data ? (
        <Card tone="accent" testID="season-summary">
          <Txt v="label">{t('home.season')}</Txt>
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}><Txt v="small">{t('home.totalKg')}</Txt><Num v="lg">{formatKg(totalKg)} {t('common.kg')}</Num></View>
            <View style={{ flex: 1 }}><Txt v="small">{t('home.totalPaid')}</Txt><Num v="lg" style={{ color: color.accent }}>{formatINR(totalPaid)}</Num></View>
            <View style={{ width: 84 }}><Txt v="small">{t('home.pending')}</Txt><Num v="lg">{waiting.length}</Num></View>
          </Row>
          {lots.data.statements.length > 0 ? (
            <Button variant="secondary" label={t('home.statements')} icon={<FileText color={color.accent} size={22} />} onPress={() => router.push('/statement')} testID="open-statements" />
          ) : null}
        </Card>
      ) : null}

      <Txt v="xl" accessibilityRole="header">{t('home.myLots')}</Txt>
      {lots.loading && !lots.data ? <><CardSkeleton /><CardSkeleton /></> : null}
      {lots.error && !lots.data ? (
        <Card tone="warn"><Txt>{t('home.loadFailed')} {t(`errors.${lots.error.code}`, { defaultValue: t('errors.UNKNOWN') })}</Txt><Button label={t('common.retry')} onPress={lots.reload} /></Card>
      ) : null}
      {lots.data && shown.length === 0 ? (
        <Card><Txt v="xl">{t('home.emptyTitle')}</Txt><Txt>{t('home.emptyBody')}</Txt></Card>
      ) : null}
      {shown.map((l) => (
        <LotCard key={l.sscc} lot={l}
          onOpen={() => router.push(l.draft ? `/confirm/${l.sscc}` : `/lot/${l.sscc}`)}
          onStatement={() => router.push(`/statement/${l.sscc}`)} />
      ))}
      {lots.data && !lots.data.fromListEndpoint && shown.length > 0 ? <Txt v="small">{t('home.listNote')}</Txt> : null}
    </Page>
  );
}
