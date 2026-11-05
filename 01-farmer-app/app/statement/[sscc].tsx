import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Square, Volume2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CropIcon, PortalFooter, ScreenHeader } from '../../src/components/chrome';
import { ProofChip, ProofDrawer } from '../../src/components/ProofDrawer';
import { Button, Card, CardSkeleton, Chip, Num, Page, Row, Txt } from '../../src/components/ui';
import type { Proof } from '../../src/contract/contract';
import { useAsync } from '../../src/hooks/useAsync';
import { api } from '../../src/lib/api';
import { formatINR, formatKg, formatPlainDate } from '../../src/lib/format';
import type { Lang } from '../../src/lib/numberWords';
import { planRead, speakLines, type ReadHandle, type ReadPlan } from '../../src/lib/speech';
import { commodityFromRef, statementScript } from '../../src/lib/statementScript';
import { color, radius, space } from '../../src/theme';

const lineBox = (on: boolean) => ({ paddingVertical: space.s2, paddingHorizontal: space.s2, borderRadius: radius.sm, backgroundColor: on ? color.warnBg : 'transparent' });

export default function StatementDetail() {
  const { sscc } = useLocalSearchParams<{ sscc: string }>();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const lang = (['bn', 'hi', 'en'].includes(i18n.language) ? i18n.language : 'bn') as Lang;
  const st = useAsync((s) => api.statements(s), []);
  const s = st.data?.items.find((x) => x.sscc === sscc);
  const lot = useAsync((sig) => api.lot(sscc, sig).catch(() => null), [sscc]);
  const [open, setOpen] = useState<Proof | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [plan, setPlan] = useState<ReadPlan | null | undefined>(undefined); // undefined: still looking for a voice
  const handle = useRef<ReadHandle | null>(null);

  const crop = lot.data?.commodity ?? (s ? commodityFromRef(s.humanRef) : undefined);
  /** The spoken script in a given language. The on-screen text always stays in the app language. */
  const scriptFor = (l: Lang) => {
    if (!s) return [];
    const tl = i18n.getFixedT(l);
    return statementScript(s, crop ? String(tl(`crop.${crop}`)) : String(tl('lot.title')), l, (k, o) => String(tl(k, o as never)), (type) => String(tl(`deduction.${type}`)));
  };
  const script = useMemo(scriptFor.bind(null, lang), [s, crop, lang, i18n]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = () => { handle.current?.stop(); handle.current = null; setReading(false); setActive(null); };
  useEffect(() => stop, []);
  useEffect(() => {
    // decide up front which voice will be used, so the note about the English fallback is there before the button is pressed
    stop();
    setPlan(undefined);
    let live = true;
    void planRead(lang).then((p) => { if (live) setPlan(p); });
    return () => { live = false; };
  }, [lang, sscc]);

  const read = async () => {
    if (reading) return stop();
    const p = plan === undefined ? await planRead(lang) : plan;
    setPlan(p);
    if (!p) return; // no voice at all: the message below says so and the text stays on screen
    const lines = p.lang === lang ? script : scriptFor(p.lang);
    setReading(true);
    const h = speakLines(lines.map((l) => l.text), p.voice, (i) => setActive(lines[i]?.key ?? null));
    handle.current = h;
    void h.done.then(() => { if (handle.current === h) { handle.current = null; setReading(false); setActive(null); } });
  };

  const noVoiceText = lang === 'bn' ? t('statement.noVoice') : lang === 'hi' ? t('statement.noVoiceHi') : t('statement.noVoiceEn');

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('statement.title')} />
      <Page footer={<PortalFooter />}>
        {st.loading && !st.data ? <><CardSkeleton /><CardSkeleton /></> : null}
        {st.error && !st.data ? <Card tone="warn"><Txt>{t(`errors.${st.error.code}`, { defaultValue: t('errors.UNKNOWN') })}</Txt><Button label={t('common.retry')} onPress={st.reload} /></Card> : null}
        {st.data && !s ? (
          <Card testID="no-statement"><Txt v="xl">{t('statement.emptyTitle')}</Txt><Txt>{t('statement.emptyBody')}</Txt>
            <Button label={t('confirm.viewLot')} onPress={() => router.replace(`/lot/${sscc}`)} />
          </Card>
        ) : null}

        {s ? (
          <>
            <Card>
              <Row><CropIcon commodity={crop} size={32} /><Txt v="xl" style={{ flex: 1 }}>{crop ? t(`crop.${crop}`) : t('lot.title')}</Txt></Row>
              <Txt v="mono">{s.humanRef}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip label={t('grade', { g: s.grade })} tone="ok" />
                <Num v="body">{formatKg(s.kg)} {t('common.kg')}</Num>
              </Row>
              <Txt v="small">{t('statement.buyer')}: {s.buyerType}</Txt>
            </Card>

            <View style={[{ backgroundColor: color.accent, borderRadius: radius.md, padding: space.s4, gap: space.s1 }, lineBox(active === 'net') && { backgroundColor: color.accent }]} testID="net-card">
              <Txt v="label" style={{ color: '#DCE8DF' }}>{t('statement.net')}</Txt>
              <Num v="money" style={{ color: color.accentInk }} testID="net-amount">{formatINR(s.net)}</Num>
              {s.paidOn ? <Txt style={{ color: color.accentInk }}>{t('statement.paidOn')}: {formatPlainDate(s.paidOn)}</Txt> : <Txt style={{ color: color.accentInk }}>{t('statement.notPaid')}</Txt>}
            </View>

            <Button big variant={reading ? 'secondary' : 'primary'} label={reading ? t('statement.stop') : t('statement.listen')}
              icon={reading ? <Square color={color.accent} size={24} /> : <Volume2 color={color.accentInk} size={26} />} onPress={() => void read()} testID="read-aloud" />
            {reading ? <Txt v="small" accessibilityLiveRegion="polite">{t('statement.reading')}</Txt> : null}
            {plan?.fallback ? <Txt v="small" testID="voice-fallback-note">{lang === 'hi' ? t('statement.fallbackHi') : t('statement.fallbackBn')}</Txt> : null}
            {plan === null ? <Card tone="warn"><Txt testID="no-voice">{noVoiceText}</Txt></Card> : null}

            <Card testID="breakdown">
              <View style={lineBox(active === 'gross')}>
                <Row style={{ justifyContent: 'space-between' }}><Txt style={{ flex: 1 }}>{t('statement.gross')}</Txt><Num testID="gross-amount">{formatINR(s.gross)}</Num></Row>
              </View>
              <Txt v="label" style={{ marginTop: space.s2 }}>{t('statement.deductions')}</Txt>
              {s.deductions.map((d, i) => (
                <View key={`${d.type}-${i}`} style={lineBox(active === `ded:${i}`)}>
                  <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }} >
                    <Txt style={{ flex: 1 }} testID={`ded-${d.type}`}>{t(`deduction.${d.type}`)}</Txt>
                    <Num style={{ color: color.danger }}>−{formatINR(d.amount)}</Num>
                  </Row>
                </View>
              ))}
              <View style={[{ borderTopWidth: 2, borderColor: color.ink, marginTop: space.s2, paddingTop: space.s2 }, lineBox(active === 'net')]}>
                <Row style={{ justifyContent: 'space-between' }}><Txt v="lg" style={{ flex: 1 }}>{t('statement.net')}</Txt><Num v="xl" style={{ color: color.accent }}>{formatINR(s.net)}</Num></Row>
              </View>
            </Card>

            <Card>
              {s.upiRef ? (
                <>
                  <Txt v="label">{t('statement.upi')}</Txt>
                  <Row style={{ flexWrap: 'wrap' }}><Txt v="mono" style={{ color: color.ink, fontSize: 18 }} testID="upi-ref">SIM {s.upiRef}</Txt><Chip label={t('statement.simulated')} tone="warn" /></Row>
                </>
              ) : null}
              {s.paidOn ? <View style={lineBox(active === 'paid')}><Txt v="label">{t('statement.paidOn')}</Txt><Num>{formatPlainDate(s.paidOn)}</Num></View> : null}
            </Card>

            {s.proofs.length > 0 ? (
              <View style={{ gap: space.s2 }}>
                <Txt v="label">{t('statement.proofs')}</Txt>
                <Row style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>{s.proofs.map((p) => <ProofChip key={p.txId} proof={p} onOpen={setOpen} />)}</Row>
              </View>
            ) : null}
            <Button variant="ghost" label={t('confirm.viewLot')} onPress={() => router.push(`/lot/${s.sscc}`)} />
          </>
        ) : null}
      </Page>
      <ProofDrawer proof={open} onClose={() => setOpen(null)} />
    </View>
  );
}
