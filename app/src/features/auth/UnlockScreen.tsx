import type { DB } from '@op-engineering/op-sqlite';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NewPasswordForm, Screen } from '../../components/keyForms';
import { Banner, Button, Field, secretInputProps } from '../../components/ui';
import * as Biometric from '../../security/biometric';
import type { Buffer } from '../../security/crypto';
import {
  changePassword,
  hasRecoveryKey,
  unlockWithDek,
  unlockWithPassword,
  unlockWithRecoveryKey,
} from '../../security/keyHierarchy';
import { recordFailure, recordSuccess, remainingWaitMs } from '../../security/lockout';
import type { RootStackParamList } from '../../navigation/types';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { Icon } from '../../components/Icon';
import { AppMark } from '../../components/AppMark';
import { APP_NAME } from '../../brand';
import { dailyStatus } from '../../security/dailyBackup';
import { step } from '../../utils/steps';

type Mode = 'password' | 'recovery' | { newPassword: { db: DB; dek: Buffer } };

export function UnlockScreen() {
  const unlocked = useSession(s => s.unlocked);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<Mode>('password');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitMs, setWaitMs] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [bio, setBio] = useState<{ enabled: boolean; due: boolean }>(() => ({
    enabled: Biometric.isEnabled(),
    due: Biometric.passwordDue(),
  }));
  const autoPrompted = useRef(false);
  // The daily backup's record lives outside the vault, so it can be shown while locked.
  const [backedUpAt, setBackedUpAt] = useState(0);
  useEffect(() => {
    dailyStatus().then(st => st && setBackedUpAt(Math.max(st.folderOkAt, st.driveOkAt)));
  }, []);

  const refreshWait = useCallback(async () => {
    const w = await remainingWaitMs();
    setWaitMs(w);
    return w;
  }, []);

  // Count down while locked out.
  useEffect(() => {
    if (waitMs <= 0) {
      return;
    }
    const t = setInterval(() => setWaitMs(ms => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(t);
  }, [waitMs > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const tryBiometric = useCallback(async () => {
    setMessage(null);
    const r = await Biometric.getDek();
    if (r.kind === 'ok') {
      try {
        const db = unlockWithDek(r.dek);
        await recordSuccess();
        unlocked(db, r.dek);
      } catch {
        await Biometric.disable();
        setBio({ enabled: false, due: bio.due });
        setMessage('Fingerprint unlock no longer matches this vault and was turned off. Use your master password.');
      }
    } else if (r.kind === 'unavailable') {
      setBio({ enabled: Biometric.isEnabled(), due: bio.due });
      setMessage(r.message);
    }
  }, [bio.due, unlocked]);

  // Offer the fingerprint straight away, as other password managers do.
  useEffect(() => {
    step(`unlock screen shown (fingerprint ${bio.enabled ? 'on' : 'off'})`);
    (async () => {
      const w = await refreshWait();
      if (!autoPrompted.current && bio.enabled && !bio.due && w === 0) {
        autoPrompted.current = true;
        tryBiometric();
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const wait = await refreshWait();
      if (wait > 0) {
        return;
      }
      if (mode === 'password') {
        const res = await unlockWithPassword(secret);
        if (res.ok) {
          await recordSuccess();
          setSecret('');
          unlocked(res.db, res.dek);
          return;
        }
      } else if (mode === 'recovery') {
        const res = await unlockWithRecoveryKey(secret);
        if (res.ok) {
          await recordSuccess();
          setSecret('');
          setMode({ newPassword: { db: res.db, dek: res.dek } });
          return;
        }
      }
      const f = await recordFailure();
      setWaitMs(f.waitMs);
      const what = mode === 'recovery' ? 'recovery key' : 'password';
      setMessage(`Wrong ${what} (${f.failures} ${f.failures === 1 ? 'attempt' : 'attempts'}).`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not open the vault.');
    } finally {
      setBusy(false);
    }
  };

  if (typeof mode === 'object') {
    const { db, dek } = mode.newPassword;
    return (
      <Screen
        title="Set a new master password"
        body="You opened Anchor with your recovery key. Choose a new master password; your recovery key keeps working. Old backups still open with the old password or the recovery key.">
        <NewPasswordForm
          submitTitle="Save and open Anchor"
          busyTitle="Saving…"
          onSubmit={async pw => {
            await changePassword(dek, pw);
            unlocked(db, dek);
          }}
        />
      </Screen>
    );
  }

  const waiting = waitMs > 0;
  const waitText = waiting ? `Too many attempts · try again in ${formatWait(waitMs)}` : null;
  const recovery = mode === 'recovery';
  const showBio = bio.enabled && !bio.due && !recovery;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <AppMark size={84} />
            <Text style={s.heroTitle}>Welcome back</Text>
            <Text style={s.heroSub}>{recovery ? 'Unlock with your recovery key' : `${APP_NAME} is locked`}</Text>
            {showBio && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unlock with fingerprint"
                disabled={waiting}
                onPress={tryBiometric}
                style={s.bioCircle}>
                <Icon name="fingerprint" size={46} color={colors.primary} strokeWidth={1.8} />
                <Text style={s.bioText}>Touch to unlock</Text>
              </Pressable>
            )}
          </View>
          <View style={s.form}>
            {bio.enabled && bio.due && !recovery && (
              <Banner tone="warn" text="Weekly check: enter your master password so you don't forget it. Fingerprint works again after." />
            )}
            <Field
              label={recovery ? 'Recovery key' : 'Master password'}
              value={secret}
              onChangeText={setSecret}
              {...secretInputProps}
              secureTextEntry={!recovery}
              autoCapitalize={recovery ? 'characters' : 'none'}
              placeholder={recovery ? 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX' : undefined}
              onSubmitEditing={submit}
              returnKeyType="go"
              editable={!busy}
            />
            <Button title="Unlock" variant="dark" onPress={submit} disabled={!secret || waiting} loading={busy} />
            {waitText ? <Banner text={waitText} /> : message ? <Banner text={message} /> : null}
            {hasRecoveryKey() && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSecret('');
                  setMessage(null);
                  setMode(recovery ? 'password' : 'recovery');
                }}
                style={s.link}>
                <Text style={s.linkText}>{recovery ? 'Use master password instead' : 'Forgot password? Use recovery key'}</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Help')} style={s.link}>
              <Text style={s.linkText}>How to use Anchor</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            {backedUpAt > 0 ? (
              <View style={s.backedUp}>
                <Icon name="check" size={16} color={colors.success} strokeWidth={2.4} />
                <Text style={s.backedUpText}>Backed up {when(backedUpAt)}</Text>
              </View>
            ) : (
              <Text style={s.footer}>Offline · Encrypted on this phone</Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "today at 9:00 pm", "yesterday at 9:00 pm", or "on 3 Nov". */
function when(ms: number): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return diff <= 0 ? `today at ${time}` : diff === 1 ? `yesterday at ${time}` : `on ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
}

function formatWait(ms: number) {
  const sec = Math.ceil(ms / 1000);
  return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 64, paddingBottom: 8 },
  bioCircle: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  bioText: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  backedUp: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.successSoft,
  },
  backedUpText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.successInk },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, marginTop: 10 },
  heroSub: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', paddingHorizontal: 24 },
  form: { flex: 1, padding: 24, gap: 12 },
  link: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  footer: { textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
});
