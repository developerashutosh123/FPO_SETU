import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { ExternalLink, FileText, Landmark, PenLine } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CropIcon, PortalFooter, ScreenHeader, openExternal } from '../../src/components/chrome';
import { ProofChip, ProofDrawer } from '../../src/components/ProofDrawer';
import { Button, Card, CardSkeleton, Chip, Num, Page, Row, Txt } from '../../src/components/ui';
import { deepLink, type Proof, type TxDetail } from '../../src/contract/contract';
import { useAsync } from '../../src/hooks/useAsync';
import { usePortalUrls } from '../../src/hooks/usePortalUrls';
import { useVillageName } from '../../src/hooks/useVillages';
import { api } from '../../src/lib/api';
import { formatINR, formatKg, formatPlainDate, formatDateIST } from '../../src/lib/format';
import { useLive } from '../../src/lib/live';
import { buildTimeline } from '../../src/lib/timeline';
import { getTxs } from '../../src/lib/txCache';
import { color, space, statusTone } from '../../src/theme';

export default function LotDetail() {
  const { sscc } = useLocalSearchParams<{ sscc: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const urls = usePortalUrls();
  const { watch } = useLive();
  const lot = useAsync((s) => api.lot(sscc, s), [sscc]);
  const statements = useAsync((s) => api.statements(s).catch(() => ({ items: [] })), []);
  const village = useVillageName(lot.data?.village, i18n.language);
  const [txs, setTxs] = useState<Map<string, TxDetail>>(new Map());
  const [open, setOpen] = useState<Proof | null>(null);

  useEffect(() => { if (lot.data) watch([{ sscc: lot.data.sscc, humanRef: lot.data.humanRef }]); }, [lot.data, watch]);
  useEffect(() => {
    let live = true;
    if (lot.data) void getTxs(lot.data.proofs).then((m) => { if (live) setTxs(m); });
    return () => { live = false; };
  }, [lot.data]);

  const statement = statements.data?.items.find((s) => s.sscc === sscc);
  const steps = useMemo(() => (lot.data ? buildTimeline(lot.data, txs, statement, village) : []), [lot.data, txs, statement, village]);
  const l = lot.data;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('lot.title')} />
      <Page footer={<PortalFooter />}>
        {lot.loading && !l ? <><CardSkeleton /><CardSkeleton /></> : null}
        {lot.error && !l ? (
          <Card tone="warn"><Txt testID="lot-error">{t(`errors.${lot.error.code}`, { defaultValue: t('errors.UNKNOWN') })}</Txt><Button label={t('common.home')} onPress={() => router.replace('/home')} /></Card>
        ) : null}

        {l ? (
          <>
            <Card testID="lot-header">
              <Row><CropIcon commodity={l.commodity} size={36} /><Txt v="title" style={{ flex: 1 }}>{t(`crop.${l.commodity}`)}</Txt></Row>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label={t(`status.${l.status}`)} tone={statusTone[l.status] ?? 'neutral'} />
                {l.grade ? <Chip label={t('grade', { g: l.grade })} tone="ok" /> : null}
              </Row>
              <Txt v="mono">{l.humanRef}</Txt>
              <Row style={{ flexWrap: 'wrap', gap: space.s5 }}>
                <View><Txt v="small">{t('lot.weight')}</Txt><Num v="xl">{formatKg(l.netKg ?? l.estWeightKg)} {t('common.kg')}</Num>{l.netKg == null ? <Txt v="small">{t('lot.estimated')}</Txt> : null}</View>
                <View><Txt v="small">{t('common.bags', { n: l.bagCount })}</Txt><Txt v="body">{l.variety ?? ''}</Txt></View>
              </Row>
              <Txt v="small">{t('lot.harvestDate')}: {formatPlainDate(l.harvestOrUnloadDate)}{village ? ` · ${village}` : ''}</Txt>
            </Card>

            {l.status === 'PENDING_FARMER_SIGNATURE' ? (
              <Card tone="warn"><Txt>{t('lot.needsSignature')}</Txt><Button label={t('home.confirmNow')} icon={<PenLine color={color.accentInk} size={22} />} onPress={() => router.push(`/confirm/${l.sscc}`)} /></Card>
            ) : null}

            {l.lien?.status === 'ACTIVE' ? (
              <Card tone="warn" testID="pledged-card">
                <Row><Landmark color={color.warn} size={26} /><Txt v="xl" style={{ flex: 1 }}>{t('lot.pledgedTitle')}</Txt></Row>
                <Txt>{t('lot.pledgedBody')}</Txt>
                <ProofChip proof={l.lien.proof} onOpen={setOpen} />
              </Card>
            ) : null}

            {statement ? (
              <Card tone="accent">
                <Txt v="label">{t('lot.statementCard')}</Txt>
                <Num v="money">{formatINR(statement.net)}</Num>
                <Button label={t('home.seeStatement')} icon={<FileText color={color.accentInk} size={22} />} onPress={() => router.push(`/statement/${l.sscc}`)} testID="lot-open-statement" />
              </Card>
            ) : null}

            <Txt v="xl" accessibilityRole="header">{t('lot.timeline')}</Txt>
            <View style={{ gap: 0 }} testID="timeline">
              {steps.map((s, i) => (
                <Row key={s.key} style={{ alignItems: 'stretch', gap: space.s3 }}>
                  <View style={{ alignItems: 'center', width: 20 }}>
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: color.accent, marginTop: 6 }} />
                    {i < steps.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: color.line }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: space.s4, gap: 2 }}>
                    <Txt v="lg" testID={`step-${s.key}`}>{t(`timeline.${s.key}`)}</Txt>
                    {s.at ? <Txt v="small">{/^\d{4}-\d{2}-\d{2}$/.test(s.at) ? formatPlainDate(s.at) : formatDateIST(s.at)}</Txt> : null}
                    {s.place ? <Txt v="small">{s.place}</Txt> : null}
                    <ProofChip proof={s.proof} onOpen={setOpen} />
                  </View>
                </Row>
              ))}
            </View>

            {urls.consumer && l.status !== 'PENDING_FARMER_SIGNATURE' ? (
              <Card testID="qr-card">
                <Txt v="xl">{t('lot.qrTitle')}</Txt>
                <View style={{ alignItems: 'center', padding: space.s3, backgroundColor: '#fff' }}><QRCode value={deepLink.consumer(urls, l.sscc)} size={168} /></View>
                <Txt v="small">{t('lot.qrBody')}</Txt>
                <Txt v="mono">{deepLink.consumer(urls, l.sscc)}</Txt>
                <Button variant="secondary" label={t('lot.openConsumer')} icon={<ExternalLink color={color.accent} size={20} />} onPress={() => openExternal(deepLink.consumer(urls, l.sscc))} />
              </Card>
            ) : null}
          </>
        ) : null}
      </Page>
      <ProofDrawer proof={open} onClose={() => setOpen(null)} />
    </View>
  );
}
