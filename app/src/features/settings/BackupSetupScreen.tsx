/**
 * Backup setup (1.9.0). Shown after unlocking until a daily backup is set up, and again when the
 * copy off the phone is more than 30 days behind (when Drive won't let Vault update it by itself).
 * Nothing else in Vault opens until it's done: a vault without a copy off the phone is one lost
 * phone away from being gone for good. Help stays reachable.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { Banner, Button } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';
import { autoBackupState, chooseAutoBackupFolder } from '../../security/autoBackup';
import { BLOCK_DAYS, TIMES, configureDaily, dailyTime, offPhoneState, saveOffPhoneCopy, setDailyTime } from '../../security/dailyBackup';
import { useDb, useSession } from '../../store/session';
import { colors, fonts } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'BackupSetup'>;

export const WHY_TITLE = 'Why Anchor insists on this';
export const WHY = [
  'Anchor is fully offline: no account, no server, no copy anywhere else. That keeps your passwords private, but it also means that if this phone is lost, stolen, broken or reset, or Anchor is uninstalled, everything in it is gone for good. Nobody can recover it for you, not even us.',
  'A copy on Google Drive is what gets everything back on a new phone: install Anchor, tap “New phone? Restore from a backup”, pick the file.',
  'The copy is encrypted before it leaves Anchor. Google, or anyone who gets the file, sees only scrambled data; it opens only with your master password or recovery key. Anchor itself still never goes online: it hands the file to Android, and the Drive app uploads it.',
];

export function BackupSetupScreen({ navigation, route }: Props) {
  const blocked = route.params?.mode === 'blocked';
  const db = useDb();
  const dek = useSession(st => st.dek);
  const touchData = useSession(st => st.touchData);
  const withAutoLockPaused = useSession(st => st.withAutoLockPaused);
  const lock = useSession(st => st.lock);
  const [folder, setFolder] = useState(() => autoBackupState(db));
  const [off, setOff] = useState(() => offPhoneState(db));
  const [time, setTime] = useState(() => dailyTime(db));
  const [busy, setBusy] = useState<null | 'folder' | 'drive' | 'done'>(null);
  const [onPhoneWarning, setOnPhoneWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseFolder = async () => {
    if (!dek) {
      return;
    }
    setBusy('folder');
    setError(null);
    try {
      await withAutoLockPaused(() => chooseAutoBackupFolder(db, dek));
      setFolder(autoBackupState(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that folder.');
    } finally {
      setBusy(null);
    }
  };

  const saveToDrive = async () => {
    if (!dek) {
      return;
    }
    setBusy('drive');
    setError(null);
    setOnPhoneWarning(false);
    try {
      const r = await saveOffPhoneCopy(db, dek);
      if (r.saved && r.onPhone) {
        setOnPhoneWarning(true);
      } else if (r.saved) {
        setOff(offPhoneState(db));
        if (blocked) {
          touchData(); // up to date again: Anchor opens
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the backup.');
    } finally {
      setBusy(null);
    }
  };

  const pickTime = async (t: string) => {
    setTime(t);
    await setDailyTime(db, t).catch(() => null);
  };

  const finish = async () => {
    setBusy('done');
    try {
      await configureDaily(db);
      touchData(); // the gate re-checks and opens Anchor
    } catch (e) {
      Alert.alert('Daily backup not set', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  if (blocked) {
    const days = off?.savedAt ? Math.floor((Date.now() - off.savedAt) / 86_400_000) : BLOCK_DAYS;
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.title}>Save a fresh backup</Text>
          <Text style={s.lead}>
            Your copy on {off?.place ?? 'Google Drive'} is {days} days old, and you've changed entries since. Save a fresh copy to keep
            using Anchor.
          </Text>
          <Why />
          {onPhoneWarning && <OnPhoneWarning />}
          {error && <Banner text={error} />}
          <Button title="Save to Google Drive" onPress={saveToDrive} loading={busy === 'drive'} />
          <Text style={s.tip}>In the Save screen, tap ☰ and choose Drive. Save over the old file or as a new one.</Text>
          <Footer onHelp={() => navigation.navigate('Help')} onLock={() => lock()} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const ready = folder != null && off != null;
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Set up your backup</Text>
        <Text style={s.lead}>Three steps, once. Then Anchor backs itself up every day at the time you choose.</Text>
        <Why />

        <Step n={1} done={folder != null} title="A daily copy on this phone">
          <Text style={s.body}>
            {folder
              ? `Saving to “${folder.folder}”. The last 7 days are kept, so you can go back to yesterday's copy.`
              : 'Pick a folder (for example Downloads or Documents). Anchor keeps the last 7 daily copies there.'}
          </Text>
          <Button
            title={folder ? 'Change folder' : 'Choose folder'}
            small
            variant={folder ? 'soft' : 'primary'}
            onPress={chooseFolder}
            loading={busy === 'folder'}
            disabled={busy != null && busy !== 'folder'}
            style={s.stepButton}
          />
        </Step>

        <Step n={2} done={off != null} title="A copy on Google Drive">
          <Text style={s.body}>
            {off
              ? off.persisted
                ? `Saved as “${off.name}” on ${off.place}. Anchor updates this file every day.`
                : `Saved as “${off.name}” on ${off.place}. ${off.place} doesn't let Anchor update the file by itself, so Anchor will remind you to save a fresh copy.`
              : 'This is the copy that survives a lost or stolen phone. In the Save screen, tap ☰ and choose Drive.'}
          </Text>
          {onPhoneWarning && <OnPhoneWarning />}
          <Button
            title={off ? 'Save again' : 'Save to Google Drive'}
            small
            variant={off ? 'soft' : 'primary'}
            onPress={saveToDrive}
            loading={busy === 'drive'}
            disabled={busy != null && busy !== 'drive'}
            style={s.stepButton}
          />
        </Step>

        <Step n={3} done title="When to back up each day">
          <View style={s.segment}>
            {TIMES.map(t => {
              const active = t.value === time;
              return (
                <Pressable
                  key={t.value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => pickTime(t.value)}
                  style={[s.segBtn, active && s.segBtnOn]}>
                  <Text style={[s.segText, active && s.segTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={s.hint}>Works while Anchor is closed. Android may run it a few minutes late to save battery.</Text>
        </Step>

        {error && <Banner text={error} />}
        <Button title="Done: open Anchor" onPress={finish} disabled={!ready} loading={busy === 'done'} />
        {!ready && <Text style={s.tip}>Finish steps 1 and 2 to open Anchor.</Text>}
        <Footer onHelp={() => navigation.navigate('Help')} onLock={() => lock()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Why() {
  return (
    <View style={s.why}>
      <Text style={s.whyTitle}>{WHY_TITLE}</Text>
      {WHY.map(p => (
        <Text key={p.slice(0, 20)} style={s.body}>
          {p}
        </Text>
      ))}
    </View>
  );
}

function OnPhoneWarning() {
  return (
    <Banner
      tone="warn"
      text="That file was saved on this phone, so a stolen or broken phone would take it too. Save again and choose Google Drive in the Save screen (tap ☰)."
    />
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <View style={s.step}>
      <View style={s.stepHead}>
        <View style={[s.badge, done && s.badgeDone]}>
          {done ? <Icon name="check" size={16} color={colors.onPrimary} /> : <Text style={s.badgeText}>{n}</Text>}
        </View>
        <Text style={s.stepTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Footer({ onHelp, onLock }: { onHelp: () => void; onLock: () => void }) {
  return (
    <View style={s.footer}>
      <Button title="How to use Anchor" small variant="ghost" onPress={onHelp} />
      <Button title="Lock" small variant="ghost" onPress={onLock} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, color: colors.ink },
  lead: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  why: { backgroundColor: colors.deep, borderRadius: 18, padding: 16, gap: 10 },
  whyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  tip: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center' },
  step: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 10 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flex: 1 },
  stepButton: { alignSelf: 'flex-start' },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  badgeDone: { backgroundColor: colors.success },
  badgeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  segTextOn: { color: colors.onPrimary },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
});
