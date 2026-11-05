import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { KeyRound, Smartphone } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch, PortalFooter } from '../src/components/chrome';
import { Button, Card, Page, Txt } from '../src/components/ui';
import { api } from '../src/lib/api';
import { ensureRegistered } from '../src/lib/deviceKey';
import { asApiError } from '../src/lib/errors';
import { useSession } from '../src/lib/session';
import { color, FONT_MONO, MIN_TOUCH, radius, size, space } from '../src/theme';

const input = {
  minHeight: MIN_TOUCH + 12, borderWidth: 2, borderColor: color.accent, borderRadius: radius.lg, paddingHorizontal: space.s5,
  fontSize: size.lg, color: color.ink, backgroundColor: color.surface, fontFamily: FONT_MONO,
} as const;

export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn } = useSession();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => { const c = asApiError(e).code; setError(t(`errors.${c}`, { defaultValue: t('errors.UNKNOWN') })); };

  const sendOtp = async () => {
    setError(null);
    if (!/^\d{10}$/.test(phone)) return setError(t('login.badPhone'));
    setBusy(true);
    try { setDemoOtp((await api.otpRequest(phone)).demoOtp); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.otpVerify(phone, otp);
      signIn(res);
      // First sign-in on this phone: make the signing key and give the gateway its public half (POST /farmers/me/device-key).
      let created = false;
      try { created = (await ensureRegistered(res.user.id)).created; }
      catch (e) {
        // The sign-in itself worked. A missing key is retried when the farmer confirms a lot, where it is actually needed.
        if (e instanceof Error && e.message === 'DEVICE_KEY_UNSUPPORTED') setError(t('device.failed'));
      }
      const dest = typeof next === 'string' && next.startsWith('/') ? next : '/home';
      router.replace(created ? `/device?next=${encodeURIComponent(dest)}` : dest);
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Page footer={<PortalFooter />}>
      <LanguageSwitch />
      <Txt v="title" accessibilityRole="header">{t('login.title')}</Txt>
      <Txt v="small">{t('app.tagline')}</Txt>

      <View style={{ gap: space.s2 }}>
        <Txt v="label">{t('login.phone')}</Txt>
        <TextInput
          value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" inputMode="numeric" editable={!demoOtp}
          accessibilityLabel={t('login.phone')} testID="phone-input" style={input} placeholder="9000000001" placeholderTextColor={color.ink3} autoComplete="tel"
        />
        <Txt v="small">{t('login.demoPhone')}</Txt>
      </View>

      {!demoOtp ? (
        <Button big label={t('login.sendOtp')} icon={<Smartphone color={color.accentInk} size={24} />} onPress={sendOtp} busy={busy} testID="send-otp" />
      ) : (
        <>
          <Card tone="warn" testID="demo-otp-card">
            <Txt v="label">{t('login.demoOtp')}</Txt>
            <Txt v="money" style={{ color: color.warn, letterSpacing: 4 }} testID="demo-otp">{demoOtp}</Txt>
            <Txt v="small">{t('login.demoHint')}</Txt>
          </Card>
          <View style={{ gap: space.s2 }}>
            <Txt v="label">{t('login.otp')}</Txt>
            <TextInput
              value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" inputMode="numeric"
              accessibilityLabel={t('login.otp')} testID="otp-input" style={input} placeholder="123456" placeholderTextColor={color.ink3} autoComplete="one-time-code"
            />
          </View>
          <Button big label={t('login.enter')} icon={<KeyRound color={color.accentInk} size={24} />} onPress={verify} busy={busy} disabled={otp.length !== 6} testID="verify-otp" />
          <Button variant="ghost" label={t('login.changePhone')} onPress={() => { setDemoOtp(null); setOtp(''); setError(null); }} />
        </>
      )}
      {error ? <Card tone="warn"><Txt testID="login-error" accessibilityRole="alert">{error}</Txt></Card> : null}
    </Page>
  );
}
