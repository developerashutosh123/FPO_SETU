import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { ExternalLink, Copy, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { deepLink, type LedgerReceipt, type Proof, type TxDetail } from '../contract/contract';
import { usePortalUrls } from '../hooks/usePortalUrls';
import { formatDateIST, formatTimeIST } from '../lib/format';
import { getTx } from '../lib/txCache';
import { color, MIN_TOUCH, radius, space } from '../theme';
import { Button, Chip, Row, Skeleton, Txt } from './ui';

const ORG_SHORT: Record<string, string> = { FpoOrgMSP: 'FPO', BankOrgMSP: 'Bank', BuyerOrgMSP: 'Buyer', RegulatorOrgMSP: 'Regulator' };

/** Ledger proof drawer (CONTRACT.md section 9.3): tx ID with copy, channel, block, endorsing orgs, commit time, link to the Gov explorer. */
export function ProofDrawer({ proof, receipt, onClose }: { proof: Proof | null; receipt?: LedgerReceipt | null; onClose: () => void }) {
  const { t } = useTranslation();
  const urls = usePortalUrls();
  const [tx, setTx] = useState<TxDetail | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setTx(undefined);
    setCopied(false);
    if (!proof || (receipt && receipt.txId === proof.txId)) return;
    let live = true;
    void getTx(proof.txId).then((x) => { if (live) setTx(x); });
    return () => { live = false; };
  }, [proof, receipt]);

  if (!proof) return null;
  const known = receipt && receipt.txId === proof.txId ? receipt : null;
  const endorsers = known?.endorsers ?? tx?.endorsers;
  const committed = known?.committedAt ?? tx?.timestamp;
  const fn = known ? `${known.chaincode} · ${known.fn}` : tx ? `${tx.chaincode} · ${tx.fn}` : undefined;
  const copy = async () => { try { await globalThis.navigator?.clipboard?.writeText(proof.txId); setCopied(true); } catch { /* clipboard blocked */ } };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(27,31,35,0.45)' }} onPress={onClose} accessibilityLabel={t('common.close')} />
      <View style={{ backgroundColor: color.surface, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, maxHeight: '80%', width: '100%', maxWidth: 480, alignSelf: 'center', borderColor: color.line, borderWidth: 1 }} testID="proof-drawer">
        <Row style={{ padding: space.s4, justifyContent: 'space-between' }}>
          <Txt v="xl" style={{ flex: 1 }}>{t('proofDrawer.title')}</Txt>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><X color={color.ink} size={24} /></Pressable>
        </Row>
        <ScrollView contentContainerStyle={{ padding: space.s4, paddingTop: 0, gap: space.s3 }}>
          <View>
            <Txt v="label">{t('proofDrawer.tx')}</Txt>
            <Txt v="mono" selectable style={{ wordBreak: 'break-all' } as object} testID="proof-txid">{proof.txId}</Txt>
            <Button variant="secondary" label={copied ? t('common.copied') : t('common.copy')} icon={<Copy color={color.accent} size={20} />} onPress={copy} />
          </View>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip label={`${t('proofDrawer.channel')}: ${proof.channel}`} />
            <Chip label={`${t('proofDrawer.block')}: #${new Intl.NumberFormat('en-IN').format(proof.blockNumber)}`} />
          </Row>
          {fn ? <View><Txt v="label">{t('proofDrawer.fn')}</Txt><Txt v="mono">{fn}</Txt></View> : null}
          {tx === undefined && !known ? <Skeleton h={48} /> : null}
          {tx === null && !known ? <Txt v="small">{t('proofDrawer.unavailable')}</Txt> : null}
          {endorsers ? (
            <View style={{ gap: space.s2 }}>
              <Txt v="label">{t('proofDrawer.endorsers')}</Txt>
              <Row style={{ flexWrap: 'wrap' }}>{endorsers.map((o) => <Chip key={o} tone="ok" label={ORG_SHORT[o] ?? o} />)}</Row>
            </View>
          ) : null}
          {committed ? <View><Txt v="label">{t('proofDrawer.committed')}</Txt><Txt>{formatDateIST(committed)} {formatTimeIST(committed)} IST</Txt></View> : null}
          {urls.gov ? (
            <Button variant="secondary" label={t('proofDrawer.explorer')} icon={<ExternalLink color={color.accent} size={20} />} onPress={() => void Linking.openURL(deepLink.govTx(urls, proof.txId))} />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Compact proof chip: opens the drawer. */
export function ProofChip({ proof, onOpen }: { proof?: Proof; onOpen: (p: Proof) => void }) {
  const { t } = useTranslation();
  if (!proof) return null;
  return (
    <Pressable onPress={() => onOpen(proof)} accessibilityRole="button" accessibilityLabel={`${t('lot.proof')} ${proof.txId.slice(0, 8)}`}
      style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', borderWidth: 1, borderColor: color.accent, borderRadius: radius.sm, paddingHorizontal: space.s2, backgroundColor: color.accentBg }}>
      <Txt v="mono" style={{ color: color.accent }}>{t('lot.proof')} · {proof.txId.slice(0, 8)}…</Txt>
    </Pressable>
  );
}
