/** Settings sub-screens: change master password, recovery key, restore from a backup. */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { NewPasswordForm, RecoveryKeyPanel, Screen, s as k } from '../../components/keyForms';
import { Banner, Button, Field, secretInputProps } from '../../components/ui';
import { countEntries } from '../../db/database';
import type { RootStackParamList } from '../../navigation/types';
import { openBackup, parseBackup, restoreInto, type BackupFile } from '../../security/backup';
import { wipe } from '../../security/crypto';
import { openTextFile } from '../../security/files';
import { changePassword, createRecoveryKey, hasRecoveryKey, verifyPassword } from '../../security/keyHierarchy';
import { useDb, useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { useExportBackup } from './useExportBackup';

/** Asks for the current master password first, so an unlocked phone left on a table isn't enough. */
function ConfirmPassword({ onConfirmed, action }: { onConfirmed: () => void; action: string }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = async () => {
    setBusy(true);
    setError(null);
    try {
      if (await verifyPassword(pw)) {
        setPw('');
        onConfirmed();
      } else {
        setError('That is not your current master password.');
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 12 }}>
      <Field label="Current master password" value={pw} onChangeText={setPw} {...secretInputProps} autoFocus onSubmitEditing={check} />
      {error && <Banner text={error} />}
      <Button title={action} onPress={check} disabled={!pw} loading={busy} />
    </View>
  );
}

export function ChangePasswordScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ChangePassword'>) {
  const dek = useSession(st => st.dek);
  const [step, setStep] = useState<'confirm' | 'new' | 'done'>('confirm');
  const { exportNow, busy } = useExportBackup();

  if (step === 'done') {
    return (
      <Screen title="Master password changed" onBack={() => navigation.goBack()}>
        <View style={k.note}>
          <Text style={k.noteText}>
            Backups made before today still open with your old master password, or with your recovery key. Export a new
            backup so your latest copy uses the new password.
          </Text>
        </View>
        <Button title="Export a new backup" onPress={exportNow} loading={busy} />
        <Button title="Done" variant="ghost" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }
  return (
    <Screen
      title="Change master password"
      body="Only the lock on your vault's key changes, so this takes seconds. Fingerprint unlock keeps working."
      onBack={() => navigation.goBack()}>
      {step === 'confirm' ? (
        <ConfirmPassword action="Continue" onConfirmed={() => setStep('new')} />
      ) : (
        <NewPasswordForm
          submitTitle="Change master password"
          busyTitle="Saving…"
          note="Write the new password down somewhere safe off your phone."
          onSubmit={async pw => {
            if (!dek) {
              throw new Error('Anchor is locked.');
            }
            await changePassword(dek, pw);
            setStep('done');
          }}
        />
      )}
    </Screen>
  );
}

export function RecoveryKeyScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'RecoveryKey'>) {
  const dek = useSession(st => st.dek);
  const existing = hasRecoveryKey();
  const [step, setStep] = useState<'confirm' | { code: string }>('confirm');
  const [error, setError] = useState<string | null>(null);

  const make = async () => {
    if (!dek) {
      return;
    }
    try {
      setStep({ code: await createRecoveryKey(dek) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a recovery key.');
    }
  };

  if (typeof step === 'object') {
    return (
      <Screen title="Your new recovery key" body="It opens your vault and your backups if you forget the master password. It is shown only now.">
        <RecoveryKeyPanel code={step.code} doneTitle="Done" onDone={() => navigation.goBack()} />
      </Screen>
    );
  }
  return (
    <Screen
      title="Recovery key"
      onBack={() => navigation.goBack()}
      body={
        existing
          ? 'You have a recovery key. Make a new one if you lost the old one or someone else may have seen it. The old key then stops opening this vault, but backups made before still open with it.'
          : "You don't have a recovery key yet. It's a 24-character code you write down, and the only way back if you forget the master password."
      }>
      <ConfirmPassword action={existing ? 'Make a new recovery key' : 'Create recovery key'} onConfirmed={make} />
      {error && <Banner text={error} />}
    </Screen>
  );
}

export function RestoreScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Restore'>) {
  const db = useDb();
  const touchData = useSession(st => st.touchData);
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
      wipe(opened.dek); // only the entries are taken over; this vault keeps its own key
      const current = countEntries(db);
      const incoming = opened.data.entries.length;
      Alert.alert(
        'Replace your entries?',
        `Your ${current} current ${current === 1 ? 'entry' : 'entries'} will be replaced by the ${incoming} in this backup. This can't be undone. Export a backup of the current ones first if you may need them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: () => {
              try {
                restoreInto(db, opened.data);
                touchData();
                setSecret('');
                Alert.alert('Backup restored', `${incoming} ${incoming === 1 ? 'entry' : 'entries'} restored.`);
                navigation.goBack();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not restore the backup.');
              }
            },
          },
        ],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the backup.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Restore from a backup"
      body="Replaces the entries in this vault with the ones in a backup file. Your master password, recovery key and fingerprint setting stay as they are."
      onBack={() => navigation.goBack()}>
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
            label="The backup's master password, or your recovery key"
            value={secret}
            onChangeText={setSecret}
            {...secretInputProps}
            onSubmitEditing={restore}
          />
          <Button title="Restore" onPress={restore} disabled={!secret} loading={busy} />
        </>
      )}
      {error && <Banner text={error} />}
    </Screen>
  );
}

const st = StyleSheet.create({
  fileBox: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 2 },
  fileName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
