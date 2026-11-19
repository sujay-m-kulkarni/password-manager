/**
 * Shared pieces for setup, password change, recovery and restore:
 *  - Screen: the Option D page frame (title, kicker, body, scrolling content)
 *  - NewPasswordForm: master password + confirm + strength rule
 *  - RecoveryKeyPanel: shows a new recovery key once, with "I've written it down"
 *  - BiometricOffer: turn on fingerprint (and optionally phone lock)
 */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Biometric from '../security/biometric';
import { copyWithAutoClear } from '../security/clipboard';
import type { Buffer } from '../security/crypto';
import { useSession } from '../store/session';
import { colors, fonts } from '../theme';
import { estimateStrength } from '../utils/strength';
import { Banner, Button, Field, StrengthBar, secretInputProps } from './ui';
import { Icon } from './Icon';

export function Screen({
  kicker,
  title,
  body,
  children,
  onBack,
}: {
  kicker?: string;
  title: string;
  body?: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {onBack && <Button title="‹ Back" variant="ghost" small onPress={onBack} style={{ alignSelf: 'flex-start' }} />}
          <View style={{ gap: 8 }}>
            {kicker && <Text style={s.kicker}>{kicker}</Text>}
            <Text style={s.title}>{title}</Text>
            {body && <Text style={s.body}>{body}</Text>}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function NewPasswordForm({
  submitTitle,
  busyTitle,
  onSubmit,
  note,
}: {
  submitTitle: string;
  busyTitle: string;
  onSubmit: (password: string) => Promise<void>;
  note?: string;
}) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = estimateStrength(pw);
  const mismatch = confirm.length > 0 && confirm !== pw;
  const canSubmit = strength.acceptable && pw === confirm && !busy;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(pw);
      setPw('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 10 }}>
        <Field label="Master password" value={pw} onChangeText={setPw} {...secretInputProps} autoFocus />
        {pw.length > 0 && <StrengthBar score={strength.score} label={strength.label} />}
        <Text style={s.hint}>
          {pw.length > 0 && strength.hint
            ? strength.hint
            : 'At least 12 characters, or 4+ words like “purple mango river forty”.'}
        </Text>
      </View>
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} {...secretInputProps} />
      {mismatch && <Banner text="Passwords don't match." />}
      {error && <Banner text={error} />}
      {note && (
        <View style={s.note}>
          <Text style={s.noteText}>{note}</Text>
        </View>
      )}
      <Button title={busy ? busyTitle : submitTitle} onPress={submit} disabled={!canSubmit} loading={busy} />
    </View>
  );
}

export function RecoveryKeyPanel({ code, onDone, doneTitle }: { code: string; onDone: () => void; doneTitle: string }) {
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  const [writtenDown, setWrittenDown] = useState(false);
  return (
    <View style={{ gap: 16 }}>
      <View style={s.codeBox} accessible accessibilityLabel={`Recovery key ${code.split('').join(' ')}`}>
        {code.split('-').map((g, i) => (
          <Text key={i} style={s.codeGroup}>
            {g}
          </Text>
        ))}
      </View>
      <View style={s.note}>
        <Text style={s.noteText}>
          Write it on paper and keep it somewhere safe, away from your phone. It opens your vault and your backups if
          you forget the master password. Anyone who has it can open them too.
        </Text>
      </View>
      <Button
        title="Copy (clears in 30 s)"
        variant="soft"
        small
        onPress={() => copyWithAutoClear(code, Math.max(30, clipboardSec))}
        style={{ alignSelf: 'flex-start' }}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: writtenDown }}
        onPress={() => setWrittenDown(v => !v)}
        style={s.checkRow}>
        <View style={[s.check, writtenDown && s.checkOn]}>{writtenDown && <Icon name="check" size={16} color={colors.onPrimary} strokeWidth={3} />}</View>
        <Text style={s.checkText}>I've written down my recovery key</Text>
      </Pressable>
      <Button title={doneTitle} onPress={onDone} disabled={!writtenDown} />
    </View>
  );
}

export function BiometricOffer({ dek, onDone }: { dek: Buffer; onDone: () => void }) {
  const withAutoLockPaused = useSession(st => st.withAutoLockPaused);
  const [support, setSupport] = useState<Biometric.BiometricSupport | null>(null);
  const [phoneLock, setPhoneLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Biometric.support().then(setSupport);
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await withAutoLockPaused(() => Biometric.enable(dek, phoneLock));
      onDone();
    } catch (e) {
      setError(e instanceof Error && !/cancel/i.test(e.message) ? e.message : 'Not turned on. You can do it later in Settings.');
    } finally {
      setBusy(false);
    }
  };

  if (!support) {
    return null;
  }
  if (!support.fingerprint && !support.phoneLock) {
    return (
      <View style={{ gap: 16 }}>
        <Banner tone="warn" text="This phone has no fingerprint or screen lock set up. Add one in the phone's settings to unlock Anchor without typing." />
        <Button title="Continue" onPress={onDone} />
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {support.phoneLock && (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: phoneLock }}
          onPress={() => setPhoneLock(v => !v)}
          style={s.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.switchLabel}>Also allow the phone's screen lock</Text>
            <Text style={s.hint}>PIN or pattern, for when the fingerprint doesn't read. Only as strong as that PIN.</Text>
          </View>
          <View style={[s.switch, phoneLock && s.switchOn]}>
            <View style={[s.knob, phoneLock && s.knobOn]} />
          </View>
        </Pressable>
      )}
      {error && <Banner tone="warn" text={error} />}
      <Button
        title={support.fingerprint ? 'Turn on fingerprint unlock' : 'Turn on phone screen lock unlock'}
        onPress={turnOn}
        loading={busy}
      />
      <Button title="Not now" variant="ghost" onPress={onDone} />
    </View>
  );
}

export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  kicker: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  title: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  note: { backgroundColor: colors.warnSoft, borderRadius: 14, padding: 14 },
  noteText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.warnInk },
  codeBox: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.deep,
    borderRadius: 18,
    paddingVertical: 20,
    paddingHorizontal: 12,
  },
  codeGroup: { fontFamily: 'monospace', fontSize: 24, letterSpacing: 2, color: colors.ink },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary },
  checkText: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
  },
  switchLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.raised, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.onPrimary },
});
