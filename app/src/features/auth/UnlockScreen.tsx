import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Field, secretInputProps } from '../../components/ui';
import { unlockWithPassword } from '../../security/keyHierarchy';
import { recordFailure, recordSuccess, remainingWaitMs } from '../../security/lockout';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';

export function UnlockScreen() {
  const unlocked = useSession(s => s.unlocked);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitMs, setWaitMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const refreshWait = useCallback(async () => setWaitMs(await remainingWaitMs()), []);

  useEffect(() => {
    refreshWait();
  }, [refreshWait]);

  // Count down while locked out.
  useEffect(() => {
    if (waitMs <= 0) {
      return;
    }
    const t = setInterval(() => setWaitMs(ms => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, [waitMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const onUnlock = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const wait = await remainingWaitMs();
      if (wait > 0) {
        setWaitMs(wait);
        return;
      }
      const res = await unlockWithPassword(pw);
      if (res.ok) {
        await recordSuccess();
        setPw('');
        unlocked(res.db);
        return;
      }
      const f = await recordFailure();
      setWaitMs(f.waitMs);
      setMessage(`Wrong password (${f.failures} ${f.failures === 1 ? 'attempt' : 'attempts'}).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not open the vault.');
    } finally {
      setBusy(false);
    }
  };

  const waiting = waitMs > 0;
  const waitText = waiting ? `Too many attempts · try again in ${formatWait(waitMs)}` : null;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={[s.blob, s.blobPink]} />
            <View style={[s.blob, s.blobYellow]} />
            <View style={s.lockCircle}>
              <Text style={s.lockGlyph} accessibilityElementsHidden>
                ⦿
              </Text>
            </View>
            <Text style={s.heroTitle}>Welcome back</Text>
            <Text style={s.heroSub}>Your vault is locked</Text>
          </View>
          <View style={s.form}>
            <Field
              label="Master password"
              value={pw}
              onChangeText={setPw}
              {...secretInputProps}
              onSubmitEditing={onUnlock}
              returnKeyType="go"
              editable={!busy}
            />
            <Button title="Unlock" variant="dark" onPress={onUnlock} disabled={!pw || waiting} loading={busy} />
            {waitText ? <Banner text={waitText} /> : message ? <Banner text={message} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={s.footer}>Offline · Encrypted on this phone</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function formatWait(ms: number) {
  const sec = Math.ceil(ms / 1000);
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: {
    height: 360,
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
  },
  blob: { position: 'absolute', opacity: 0.35 },
  blobPink: { width: 220, height: 220, borderRadius: 110, backgroundColor: '#FF7AB6', top: -60, right: -70 },
  blobYellow: { width: 160, height: 160, borderRadius: 80, backgroundColor: '#FFC145', bottom: -50, left: -40 },
  lockCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  lockGlyph: { fontSize: 44, color: colors.primary },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.white },
  heroSub: { fontFamily: fonts.regular, fontSize: 15, color: '#EDE8FF' },
  form: { flex: 1, padding: 24, gap: 12 },
  footer: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
});
