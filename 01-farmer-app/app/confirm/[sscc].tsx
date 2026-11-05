import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { BadgeCheck, PenLine, RotateCw, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { CropIcon, PortalFooter, ScreenHeader, useWritesPaused } from '../../src/components/chrome';
import { ProofDrawer } from '../../src/components/ProofDrawer';
import { Button, Card, CardSkeleton, Num, Page, Row, Txt } from '../../src/components/ui';
import type { LedgerReceipt, Proof } from '../../src/contract/contract';
import { useAsync } from '../../src/hooks/useAsync';
import { api } from '../../src/lib/api';
import { getDeclined, setDeclined } from '../../src/lib/declined';
import { ensureRegistered, signWithDeviceKey } from '../../src/lib/deviceKey';
import { asApiError } from '../../src/lib/errors';
import { formatDateIST, formatKg, formatPlainDate, formatTimeIST } from '../../src/lib/format';
import { useSession } from '../../src/lib/session';
import { checkDraftPayload } from '../../src/lib/signing';
import { color, space } from '../../src/theme';

type Phase = 'review' | 'signing' | 'done' | 'declined';

export default function ConfirmLot() {
  const { sscc } = useLocalSearchParams<{ sscc: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useSession();
  const paused = useWritesPaused();
  const drafts = useAsync((s) => api.pendingDrafts(s), []);
  const [phase, setPhase] = useState<Phase>('review');
  const [errCode, setErrCode] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<LedgerReceipt | null>(null);
  const [open, setOpen] = useState<Proof | null>(null);

  const draft = drafts.data?.find((d) => d.sscc === sscc);
  // not in the waiting list: either already signed or never ours
  const lot = useAsync((s) => (drafts.data && !draft && phase === 'review' ? api.lot(sscc, s).catch(() => null) : Promise.resolve(null)), [sscc, !!drafts.data, !!draft, phase]);

  useEffect(() => { if (draft && getDeclined().includes(draft.sscc)) setPhase('declined'); }, [draft]);

  const sign = async (reregister = false) => {
    if (!draft || !user) return;
    setErrCode(null);
    const check = checkDraftPayload(draft);
    if (!check.ok) return setErrCode('PAYLOAD_BAD');
    setPhase('signing');
    try {
      await ensureRegistered(user.id, reregister);
      // payloadToSign is signed exactly as received: it is already canonical JSON
      const signatureHex = await signWithDeviceKey(user.id, draft.payloadToSign);
      const res = await api.farmerSign(draft.sscc, signatureHex);
      const { resource: _lot, ...r } = res;
      setReceipt(r);
      setPhase('done');
    } catch (e) {
      setPhase('review');
      setErrCode(e instanceof Error && (e.message === 'DEVICE_KEY_MISSING' || e.message === 'DEVICE_KEY_UNSUPPORTED') ? e.message : asApiError(e).code);
    }
  };

  const decline = () => { if (draft) { setDeclined([...new Set([...getDeclined(), draft.sscc])]); setPhase('declined'); } };
  const undo = () => { if (draft) { setDeclined(getDeclined().filter((x) => x !== draft.sscc)); setPhase('review'); } };

  const errText = errCode === 'PAYLOAD_BAD' ? t('confirm.payloadBad')
    : errCode === 'DEVICE_KEY_MISSING' ? t('confirm.noKey')
    : errCode === 'DEVICE_KEY_UNSUPPORTED' ? t('device.failed')
    : errCode ? t(`errors.${errCode}`, { defaultValue: t('errors.UNKNOWN') }) : null;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={t('confirm.title')} />
      <Page footer={<PortalFooter />}>
        {drafts.loading && !drafts.data ? <CardSkeleton /> : null}
        {drafts.error && !drafts.data ? <Card tone="warn"><Txt>{t(`errors.${drafts.error.code}`, { defaultValue: t('errors.UNKNOWN') })}</Txt><Button label={t('common.retry')} onPress={drafts.reload} /></Card> : null}

        {phase === 'done' && receipt ? (
          <Card tone="ok" testID="receipt">
            <Row><BadgeCheck color={color.ok} size={36} /><Txt v="title" style={{ flex: 1, color: color.ok }}>{t('confirm.doneTitle')}</Txt></Row>
            <Txt>{t('confirm.doneBody')}</Txt>
            <View><Txt v="label">{t('confirm.tx')}</Txt><Txt v="mono" selectable testID="receipt-txid">{receipt.txId}</Txt></View>
            <Row style={{ flexWrap: 'wrap', gap: space.s5 }}>
              <View><Txt v="label">{t('confirm.block')}</Txt><Num>#{receipt.blockNumber}</Num></View>
              <View><Txt v="label">{t('confirm.time')}</Txt><Num>{formatDateIST(receipt.committedAt)} {formatTimeIST(receipt.committedAt)}</Num></View>
            </Row>
            <Button label={t('confirm.viewProof')} variant="secondary" onPress={() => setOpen({ txId: receipt.txId, blockNumber: receipt.blockNumber, channel: receipt.channel })} />
            <Button label={t('confirm.viewLot')} onPress={() => router.replace(`/lot/${sscc}`)} testID="view-lot" />
            <Button variant="ghost" label={t('confirm.backHome')} onPress={() => router.replace('/home')} />
          </Card>
        ) : null}

        {phase === 'declined' ? (
          <Card tone="warn" testID="declined-card">
            <Txt v="xl">{t('confirm.declineTitle')}</Txt>
            <Txt>{t('confirm.declineBody')}</Txt>
            <Button variant="secondary" label={t('confirm.declineUndo')} onPress={undo} />
            <Button label={t('confirm.backHome')} onPress={() => router.replace('/home')} />
          </Card>
        ) : null}

        {draft && (phase === 'review' || phase === 'signing') ? (
          <>
            <Txt>{t('confirm.intro', { vle: draft.createdBy })}</Txt>
            <Card testID="draft-card">
              <Row><CropIcon commodity={draft.commodity} size={36} /><Txt v="title" style={{ flex: 1 }}>{t(`crop.${draft.commodity}`)}{draft.variety ? ` · ${draft.variety}` : ''}</Txt></Row>
              <Txt v="mono">{draft.humanRef}</Txt>
              <Row style={{ flexWrap: 'wrap', gap: space.s5 }}>
                <View><Txt v="small">{t('confirm.bags')}</Txt><Num v="xl">{draft.bagCount}</Num></View>
                <View><Txt v="small">{t('confirm.est')}</Txt><Num v="xl">{formatKg(draft.estWeightKg)} {t('common.kg')}</Num></View>
              </Row>
              <View><Txt v="small">{t('confirm.date')}</Txt><Num>{formatPlainDate(draft.harvestOrUnloadDate)}</Num></View>
              <View><Txt v="small">{t('confirm.vle')}</Txt><Txt>{draft.createdBy}</Txt></View>
            </Card>
            {errText ? (
              <Card tone="warn"><Txt testID="confirm-error" accessibilityRole="alert">{errText}</Txt>
                {errCode === 'ERR_BAD_FARMER_SIGNATURE' ? <Button variant="secondary" label={t('confirm.reregister')} icon={<RotateCw color={color.accent} size={20} />} onPress={() => void sign(true)} /> : null}
              </Card>
            ) : null}
            {paused ? <Txt v="small" style={{ color: color.warn }} testID="paused-why">{t('confirm.offlineWhy')}</Txt> : null}
            <Button big label={phase === 'signing' ? t('confirm.signing') : t('confirm.button')} icon={<PenLine color={color.accentInk} size={26} />}
              onPress={() => void sign()} busy={phase === 'signing'} disabled={paused} hint={paused ? t('confirm.offlineWhy') : undefined} testID="confirm-button" />
            <Button big variant="danger" label={t('confirm.notRight')} icon={<X color={color.danger} size={26} />} onPress={decline} disabled={phase === 'signing'} testID="decline-button" />
          </>
        ) : null}

        {drafts.data && !draft && phase === 'review' ? (
          <Card testID="no-draft">
            {lot.data ? (
              <>
                <Txt v="xl">{t('confirm.alreadyDone')}</Txt>
                <Button label={t('confirm.viewLot')} onPress={() => router.replace(`/lot/${sscc}`)} />
              </>
            ) : lot.loading ? <CardSkeleton /> : <Txt v="xl">{t('confirm.notFound')}</Txt>}
            <Button variant="ghost" label={t('confirm.backHome')} onPress={() => router.replace('/home')} />
          </Card>
        ) : null}
      </Page>
      <ProofDrawer proof={open} receipt={receipt} onClose={() => setOpen(null)} />
    </View>
  );
}
