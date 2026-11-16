/**
 * First run: 1 master password → 2 recovery key → 3 fingerprint.
 * Or "Restore from a backup" (new phone): pick the file → its master password or recovery key.
 */
import type { DB } from '@op-engineering/op-sqlite';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BiometricOffer,
  NewPasswordForm,
  RecoveryKeyPanel,
  Screen,
  s as k,
} from '../../components/keyForms';
import { Banner, Button, Field, secretInputProps } from '../../components/ui';
import { openBackup, parseBackup, restoreInto, type BackupFile } from '../../security/backup';
import type { Buffer } from '../../security/crypto';
import { openTextFile } from '../../security/files';
import {
  changePassword,
  createRecoveryKey,
  createVault,
  createVaultFromBackup,
  notePasswordUnlock,
} from '../../security/keyHierarchy';
import type { RootStackParamList } from '../../navigation/types';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';

type Opened = { db: DB; dek: Buffer };
type Step =
  | { name: 'password' }
  | { name: 'recovery'; opened: Opened; code: string }
  | { name: 'biometric'; opened: Opened }
  | { name: 'restore' }
  | { name: 'restoreNewPassword'; opened: Opened };

export function SetupScreen() {
  const unlocked = useSession(st => st.unlocked);
  const [step, setStep] = useState<Step>({ name: 'password' });
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const finish = (o: Opened) => unlocked(o.db, o.dek);

  switch (step.name) {
    case 'password':
      return (
        <Screen
          kicker="STEP 1 OF 3"
          title="Create your master password"
          body="It's the key to your vault. It is never stored. A recovery key (next step) is your way back if you forget it.">
          <Steps at={0} />
          <NewPasswordForm
            submitTitle="Create vault"
            busyTitle="Securing your vault…"
            onSubmit={async pw => {
              const opened = await createVault(pw);
              const code = await createRecoveryKey(opened.dek);
              setStep({ name: 'recovery', opened, code });
            }}
          />
          <Pressable accessibilityRole="button" onPress={() => setStep({ name: 'restore' })} style={st.link}>
            <Text style={st.linkText}>New phone? Restore from a backup</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Help')} style={st.link}>
            <Text style={st.linkText}>How to use Vault</Text>
          </Pressable>
        </Screen>
      );

    case 'recovery':
      return (
        <Screen
          kicker="STEP 2 OF 3"
          title="Your recovery key"
          body="If you ever forget the master password, this key opens your vault and your backups. It is shown only now.">
          <Steps at={1} />
          <RecoveryKeyPanel
            code={step.code}
            doneTitle="Continue"
            onDone={() => setStep({ name: 'biometric', opened: step.opened })}
          />
        </Screen>
      );

    case 'biometric':
      return (
        <Screen
          kicker="STEP 3 OF 3"
          title="Unlock with your fingerprint"
          body="Open Vault with a touch instead of typing the master password. Once a week Vault asks for the password, so you don't forget it.">
          <Steps at={2} />
          <BiometricOffer dek={step.opened.dek} onDone={() => finish(step.opened)} />
        </Screen>
      );

    case 'restore':
      return (
        <RestoreFromBackup
          onBack={() => setStep({ name: 'password' })}
          onRestored={(opened, via) =>
            via === 'recovery' ? setStep({ name: 'restoreNewPassword', opened }) : setStep({ name: 'biometric', opened })
          }
        />
      );

    case 'restoreNewPassword':
      return (
        <Screen
          title="Set a new master password"
          body="You opened the backup with the recovery key. Choose a new master password for this phone; the recovery key keeps working.">
          <NewPasswordForm
            submitTitle="Save and continue"
            busyTitle="Saving…"
            onSubmit={async pw => {
              await changePassword(step.opened.dek, pw);
              setStep({ name: 'biometric', opened: step.opened });
            }}
          />
        </Screen>
      );
  }
}

function RestoreFromBackup({
  onBack,
  onRestored,
}: {
  onBack: () => void;
  onRestored: (opened: Opened, via: 'password' | 'recovery') => void;
}) {
  const [file, setFile] = useState<{ name: string | null; backup: BackupFile } | null>(null);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const picked = await openTextFile();
      if (picked) {
        setFile({ name: picked.name, backup: parseBackup(picked.text) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that file.');
    }
  };

  const restore = async () => {
    if (!file) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opened = await openBackup(file.backup, secret);
      if (!opened) {
        setError("That isn't this backup's master password or recovery key.");
        return;
      }
      const db = createVaultFromBackup(opened.header, opened.dek);
      restoreInto(db, opened.data);
      if (opened.via === 'password') {
        notePasswordUnlock();
      }
      setSecret('');
      onRestored({ db, dek: opened.dek }, opened.via);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore the backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      onBack={onBack}
      title="Restore from a backup"
      body="Pick your .vaultbackup file (from Google Drive, Downloads…), then enter the master password it was made with, or your recovery key.">
      <Button title={file ? 'Pick a different file' : 'Pick backup file'} variant={file ? 'soft' : 'primary'} onPress={pick} />
      {file && (
        <View style={st.fileBox}>
          <Text style={st.fileName}>{file.name ?? 'Backup file'}</Text>
          <Text style={k.hint}>Made {new Date(file.backup.created).toLocaleString()}</Text>
        </View>
      )}
      {file && (
        <>
          <Field
            label="Master password or recovery key"
            value={secret}
            onChangeText={setSecret}
            {...secretInputProps}
            onSubmitEditing={restore}
          />
          <Button title={busy ? 'Opening backup…' : 'Restore'} onPress={restore} disabled={!secret} loading={busy} />
        </>
      )}
      {error && <Banner text={error} />}
    </Screen>
  );
}

function Steps({ at }: { at: number }) {
  return (
    <View style={st.steps}>
      {[0, 1, 2].map(i => (
        <View key={i} style={[st.step, i <= at && { backgroundColor: colors.primary }]} />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#D9D3F5' },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  fileBox: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 2 },
  fileName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
