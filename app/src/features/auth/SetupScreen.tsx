import React, { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Field, StrengthBar, secretInputProps } from '../../components/ui';
import { createVault } from '../../security/keyHierarchy';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';

export function SetupScreen() {
  const unlocked = useSession(s => s.unlocked);
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = estimateStrength(pw);
  const mismatch = confirm.length > 0 && confirm !== pw;
  const canCreate = strength.acceptable && pw === confirm && !busy;

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const db = await createVault(pw);
      setPw('');
      setConfirm('');
      unlocked(db);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the vault.');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.steps}>
            <View style={[s.step, { backgroundColor: colors.primary }]} />
            <View style={s.step} />
            <View style={s.step} />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={s.kicker}>STEP 1 OF 3</Text>
            <Text style={s.title}>Create your master password</Text>
            <Text style={s.body}>
              It's the only key to your vault. It is never stored, so nobody — including this app — can recover it.
            </Text>
          </View>

          <View style={{ gap: 10 }}>
            <Field label="Master password" value={pw} onChangeText={setPw} {...secretInputProps} autoFocus />
            {pw.length > 0 && <StrengthBar score={strength.score} label={strength.label} />}
            <Text style={s.hint}>At least 12 characters, or 4+ words like “purple mango river forty”.</Text>
          </View>

          <Field label="Confirm password" value={confirm} onChangeText={setConfirm} {...secretInputProps} />
          {mismatch && <Banner text="Passwords don't match." />}
          {error && <Banner text={error} />}

          <View style={s.note}>
            <Text style={s.noteText}>
              Write this password down somewhere safe off your phone. If you forget it, your passwords cannot be
              recovered.
            </Text>
          </View>

          <View style={{ flex: 1 }} />
          <Button title={busy ? 'Securing your vault…' : 'Create vault'} onPress={onCreate} disabled={!canCreate} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#D9D3F5' },
  kicker: { fontFamily: fonts.bold, fontSize: 13, color: colors.primary },
  title: { fontFamily: fonts.extrabold, fontSize: 28, lineHeight: 34, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  note: { backgroundColor: colors.warnSoft, borderRadius: 14, padding: 14 },
  noteText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.warnInk },
});
