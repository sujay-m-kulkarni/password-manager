import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, SectionLabel } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';
import { backupDue, lastBackupAt } from '../../security/backup';
import {
  KEEP,
  autoBackupState,
  chooseAutoBackupFolder,
  runAutoBackup,
  turnOffAutoBackup,
} from '../../security/autoBackup';
import * as Biometric from '../../security/biometric';
import { hasRecoveryKey, unlockCost } from '../../security/keyHierarchy';
import { useDb, useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { useAppVersion } from '../../utils/appVersion';
import { useExportBackup } from './useExportBackup';
import { APP_NAME } from '../../brand';
import {
  TIMES,
  backUpNow as runDailyBackupNow,
  canBackUpDaily,
  dailyStatus,
  dailyTime,
  offPhoneAt,
  offPhoneState,
  saveOffPhoneCopy,
  setDailyTime,
  timeLabel,
  type DailyStatus,
} from '../../security/dailyBackup';
import { Icon } from '../../components/Icon';

const AUTO_LOCK = [
  { sec: 30, label: '30 s' },
  { sec: 60, label: '1 min' },
  { sec: 300, label: '5 min' },
];
const CLIPBOARD = [
  { sec: 15, label: '15 s' },
  { sec: 30, label: '30 s' },
];

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const db = useDb();
  const dek = useSession(st => st.dek);
  const settings = useSession(st => st.settings);
  const update = useSession(st => st.updateSettings);
  const lock = useSession(st => st.lock);
  const dataVersion = useSession(st => st.dataVersion);
  const withAutoLockPaused = useSession(st => st.withAutoLockPaused);
  const { exportNow, busy: exporting } = useExportBackup();
  const version = useAppVersion();

  const [support, setSupport] = useState<Biometric.BiometricSupport | null>(null);
  const [bioOn, setBioOn] = useState(Biometric.isEnabled());
  const [phoneLock, setPhoneLock] = useState(Biometric.allowsPhoneLock());
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(hasRecoveryKey());
  const [cost, setCost] = useState(unlockCost());
  const [auto, setAuto] = useState(() => autoBackupState(db));
  const [autoBusy, setAutoBusy] = useState(false);
  const [tick, setTick] = useState(0); // re-reads the backup times without marking data as changed
  const refreshAuto = () => setAuto(autoBackupState(db));
  const daily = canBackUpDaily();
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [off, setOff] = useState(() => offPhoneState(db));
  const [time, setTime] = useState(() => dailyTime(db));
  const [offBusy, setOffBusy] = useState(false);
  const refreshDaily = async () => {
    setOff(offPhoneState(db));
    setStatus(await dailyStatus());
  };

  const saveOffPhone = async () => {
    if (!dek) {
      return;
    }
    setOffBusy(true);
    try {
      const r = await saveOffPhoneCopy(db, dek);
      if (r.saved && r.onPhone) {
        Alert.alert('Saved on this phone', 'A stolen or broken phone would take that copy too. Save again and choose Google Drive in the Save screen (tap ☰).');
      }
    } catch (e) {
      Alert.alert('Backup not saved', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      await refreshDaily();
      setTick(t => t + 1);
      setOffBusy(false);
    }
  };

  const pickTime = async (t: string) => {
    setTime(t);
    await setDailyTime(db, t).catch(() => null);
    await refreshDaily();
  };

  const chooseFolder = async () => {
    if (!dek) {
      return;
    }
    setAutoBusy(true);
    try {
      await withAutoLockPaused(() => chooseAutoBackupFolder(db, dek));
    } catch (e) {
      Alert.alert('Folder not set', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      refreshAuto();
      setTick(t => t + 1);
      setAutoBusy(false);
    }
  };

  const backUpNow = async () => {
    if (!dek) {
      return;
    }
    setAutoBusy(true);
    if (daily) {
      try {
        setStatus(await runDailyBackupNow(db, dek));
      } catch (e) {
        Alert.alert('Backup not made', e instanceof Error ? e.message : 'Something went wrong.');
      }
    } else {
      await runAutoBackup(db, dek);
    }
    refreshAuto();
    setTick(t => t + 1);
    setAutoBusy(false);
  };

  const turnOff = () =>
    Alert.alert('Turn off automatic backup?', 'Backups already in the folder stay there.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          await turnOffAutoBackup(db);
          refreshAuto();
        },
      },
    ]);

  useEffect(() => {
    Biometric.support().then(setSupport);
    const unsub = navigation.addListener('focus', () => {
      setRecovery(hasRecoveryKey());
      setAuto(autoBackupState(db));
      setCost(unlockCost());
      refreshDaily();
    });
    refreshDaily();
    return unsub;
  }, [navigation, db]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = useMemo(() => lastBackupAt(db), [db, dataVersion, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => backupDue(db), [db, dataVersion, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const offAt = useMemo(() => offPhoneAt(db, status), [db, status, off, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const offStale = useMemo(() => {
    const r = db.executeSync('SELECT max(updated_at) AS changed FROM entries').rows[0] as { changed: number | null } | undefined;
    return r?.changed != null && (offAt == null || Number(r.changed) > offAt);
  }, [db, offAt, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBiometric = async (on: boolean, withPhoneLock = phoneLock) => {
    if (!dek) {
      return;
    }
    setBioBusy(true);
    setBioError(null);
    try {
      if (on) {
        await withAutoLockPaused(() => Biometric.enable(dek, withPhoneLock));
      } else {
        await Biometric.disable();
      }
      setBioOn(on);
      setPhoneLock(on && withPhoneLock);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setBioError(/cancel/i.test(msg) ? null : msg || 'Could not change fingerprint unlock.');
    } finally {
      setBioBusy(false);
    }
  };

  const bioAvailable = support && (support.fingerprint || support.phoneLock);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Settings</Text>

        {daily ? (
          <DailyCard
            folder={auto}
            off={off}
            offAt={offAt}
            stale={offStale}
            status={status}
            time={time}
            onTime={pickTime}
            busy={autoBusy}
            offBusy={offBusy}
            onBackUp={backUpNow}
            onFolder={chooseFolder}
            onSaveOff={saveOffPhone}
          />
        ) : (
          <View style={[s.backupCard, due || last == null ? s.backupDue : s.backupOk]}>
            <Text style={s.backupTitle}>{last == null ? 'No backup yet' : `Last backup: ${ago(last)}`}</Text>
            <Text style={s.backupBody}>
              {last == null
                ? 'Export an encrypted copy and keep it off this phone. Without it, a lost or reset phone means lost passwords.'
                : due
                  ? 'You have changes since then. Export a fresh copy.'
                  : 'Your backup is up to date. Keep the file off this phone.'}
            </Text>
            <Button title="Export backup" variant="dark" small onPress={exportNow} loading={exporting} style={{ alignSelf: 'flex-start' }} />
          </View>
        )}

        <SectionLabel>Unlock</SectionLabel>
        <View style={s.card}>
          {!support ? null : !bioAvailable ? (
            <Text style={s.hint}>This phone has no fingerprint or screen lock set up. Add one in the phone's settings to unlock Anchor without typing.</Text>
          ) : (
            <>
              <ToggleRow
                label={support.fingerprint ? 'Unlock with fingerprint' : 'Unlock with phone screen lock'}
                hint="The master password is still asked once a week."
                value={bioOn}
                disabled={bioBusy}
                onChange={v => setBiometric(v)}
              />
              {bioOn && support.fingerprint && support.phoneLock && (
                <ToggleRow
                  label="Also allow the phone's screen lock"
                  hint="For when the fingerprint doesn't read. Only as strong as the phone PIN."
                  value={phoneLock}
                  disabled={bioBusy}
                  onChange={v => setBiometric(true, v)}
                />
              )}
              {bioError && <Banner text={bioError} />}
            </>
          )}
        </View>

        <SectionLabel>Entries</SectionLabel>
        <View style={s.list}>
          <NavRow label="Entry types and their fields" onPress={() => navigation.navigate('EntryTypes')} />
        </View>

        <SectionLabel>Security</SectionLabel>
        <View style={s.card}>
          <Text style={s.rowLabel}>Auto-lock after inactivity</Text>
          <Segmented options={AUTO_LOCK} value={settings.autoLockSec} onChange={sec => update({ autoLockSec: sec })} />
          <Text style={s.hint}>The vault also locks as soon as you leave the app or the screen turns off.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.rowLabel}>Clear clipboard after copying</Text>
          <Segmented options={CLIPBOARD} value={settings.clipboardSec} onChange={sec => update({ clipboardSec: sec })} />
        </View>
        <View style={s.list}>
          <NavRow label="Change master password" onPress={() => navigation.navigate('ChangePassword')} />
          <NavRow
            label="Recovery key"
            value={recovery ? 'Set' : 'Not set'}
            valueColor={recovery ? colors.success : colors.danger}
            onPress={() => navigation.navigate('RecoveryKey')}
          />
        </View>
        {cost && (
          <View style={s.card}>
            <View style={s.toggleRow}>
              <Text style={[s.rowLabel, { flex: 1 }]}>Master password unlock</Text>
              <Text style={[s.navValue, { color: colors.primary }]}>{cost.ms != null ? `${(cost.ms / 1000).toFixed(1)} s` : '—'}</Text>
            </View>
            <Text style={s.hint}>
              Tuned to this phone ({cost.memMiB} MB × {cost.passes} {cost.passes === 1 ? 'pass' : 'passes'}): slow enough to make guessing
              your password expensive, quick enough for you. Changing the password re-tunes it.
            </Text>
          </View>
        )}
        {!recovery && <Banner tone="warn" text="No recovery key yet. Without one, a forgotten master password can't be undone." />}

        <SectionLabel>Backup</SectionLabel>
        {daily ? null : (
          <View style={s.card}>
            <Text style={s.rowLabel}>Automatic backup</Text>
            {auto ? (
              <>
                <Text style={s.hint}>
                  Saves an encrypted backup to “{auto.folder}” whenever your entries change, keeping the newest {KEEP}.
                  {'\n'}
                  {auto.lastAt ? `Last saved ${ago(auto.lastAt)} at ${new Date(auto.lastAt).toLocaleTimeString()}.` : 'Not saved yet.'}
                </Text>
                {auto.error && <Banner text={auto.error} />}
                <View style={s.autoActions}>
                  <Button title="Back up now" small onPress={backUpNow} loading={autoBusy} />
                  <Button title="Change folder" small variant="soft" onPress={chooseFolder} disabled={autoBusy} />
                  <Button title="Turn off" small variant="ghost" onPress={turnOff} disabled={autoBusy} />
                </View>
              </>
            ) : (
              <>
                <Text style={s.hint}>
                  Choose a folder once (for example Downloads, an SD card, or a Google Drive folder). Anchor then saves an
                  encrypted backup there by itself whenever your entries change. Those files stay even if Anchor is
                  uninstalled.
                </Text>
                <Button title="Choose backup folder" small onPress={chooseFolder} loading={autoBusy} style={{ alignSelf: 'flex-start' }} />
              </>
            )}
          </View>
        )}
        <View style={s.list}>
          <NavRow label="Export encrypted backup" onPress={exportNow} />
          <NavRow label="Restore from a backup" onPress={() => navigation.navigate('Restore')} />
        </View>

        <SectionLabel>Help</SectionLabel>
        <View style={s.list}>
          <NavRow label="How to use Anchor" onPress={() => navigation.navigate('Help')} />
          <NavRow label="About & what's new" value={version?.name} onPress={() => navigation.navigate('About')} />
        </View>

        <Button title="Lock now" variant="dark" onPress={() => lock()} />
        <Text style={s.footer}>
          Anchor {version?.name ?? ''} · Offline build · no internet permission
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DailyCard({
  folder,
  off,
  offAt,
  stale,
  status,
  time,
  onTime,
  busy,
  offBusy,
  onBackUp,
  onFolder,
  onSaveOff,
}: {
  folder: ReturnType<typeof autoBackupState>;
  off: ReturnType<typeof offPhoneState>;
  offAt: number | null;
  stale: boolean;
  status: DailyStatus | null;
  time: string;
  onTime: (t: string) => void;
  busy: boolean;
  offBusy: boolean;
  onBackUp: () => void;
  onFolder: () => void;
  onSaveOff: () => void;
}) {
  const folderAt = status?.folderOkAt || folder?.lastAt || 0;
  const offOk = off != null && !stale;
  const allGood = !!folder && offOk && !status?.error;
  return (
    <View style={s.card}>
      <View style={s.toggleRow}>
        <Text style={[s.backupTitle, { flex: 1 }]}>Daily backup</Text>
        <View style={[s.statusPill, { backgroundColor: allGood ? colors.successSoft : colors.warnSoft }]}>
          <Text style={[s.statusPillText, { color: allGood ? colors.success : colors.warnInk }]}>{allGood ? 'All good' : 'Needs attention'}</Text>
        </View>
      </View>
      <Place
        ok={!!folder && folderAt > 0}
        title={folder ? `This phone · “${folder.folder}”` : 'This phone · no folder chosen'}
        sub={folderAt ? `${when(folderAt)} · last 7 days kept` : 'Not saved yet'}
        action="Change folder"
        onAction={onFolder}
      />
      <Place
        ok={offOk}
        title={off ? `${off.place} · ${off.name}` : 'Google Drive · not saved yet'}
        sub={
          off
            ? `${offAt ? when(offAt) : 'not saved yet'} · ${off.persisted ? 'updated daily' : stale ? 'save a fresh copy' : 'saved by you'}`
            : 'The copy that survives a lost or stolen phone'
        }
        action={off?.persisted ? 'Save again' : 'Save to Drive'}
        onAction={onSaveOff}
        busy={offBusy}
      />
      {status?.error && <Banner text={status.error} />}
      <Segmented
        options={TIMES.map((t, i) => ({ sec: i, label: t.label }))}
        value={Math.max(0, TIMES.findIndex(t => t.value === time))}
        onChange={i => onTime(TIMES[i].value)}
      />
      <Text style={s.hint}>
        Every day at {timeLabel(time)}, even while {APP_NAME} is closed.
        {status?.nextAt ? ` Next: ${new Date(status.nextAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : ''}
      </Text>
      <Button title="Back up now" small variant="soft" onPress={onBackUp} loading={busy} />
    </View>
  );
}

function Place({ ok, title, sub, action, onAction, busy }: { ok: boolean; title: string; sub: string; action: string; onAction: () => void; busy?: boolean }) {
  return (
    <View style={s.place}>
      <View style={[s.placeIcon, { backgroundColor: ok ? colors.successSoft : colors.warnSoft }]}>
        <Icon name={ok ? 'check' : 'minus'} size={18} color={ok ? colors.success : colors.warnInk} strokeWidth={2.4} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.placeTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.hint} numberOfLines={2}>
          {sub}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onAction} disabled={busy} style={s.placeAction}>
        <Text style={s.placeActionText}>{busy ? '…' : action}</Text>
      </Pressable>
    </View>
  );
}

/** "today 9:00 pm", "yesterday 9:00 pm", or "3 Nov". */
function when(ms: number): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(d)) / 86_400_000);
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return diff <= 0 ? `Today ${t}` : diff === 1 ? `Yesterday ${t}` : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function ago(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) {
    return 'today';
  }
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

function ToggleRow({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[s.toggleRow, disabled && { opacity: 0.6 }]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label}</Text>
        {hint && <Text style={s.hint}>{hint}</Text>}
      </View>
      <View style={[s.switch, value && s.switchOn]}>
        <View style={[s.knob, value && s.knobOn]} />
      </View>
    </Pressable>
  );
}

function NavRow({ label, value, valueColor, onPress }: { label: string; value?: string; valueColor?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={s.navRow}>
      <Text style={[s.rowLabel, { flex: 1 }]}>{label}</Text>
      {value && <Text style={[s.navValue, { color: valueColor ?? colors.primary }]}>{value}</Text>}
      <Icon name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { sec: number; label: string }[];
  value: number;
  onChange: (sec: number) => void;
}) {
  return (
    <View style={s.segment}>
      {options.map(o => {
        const active = o.sec === value;
        return (
          <Pressable
            key={o.sec}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.sec)}
            style={[s.segBtn, active && s.segBtnOn]}>
            <Text style={[s.segText, active && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, paddingHorizontal: 4 },
  backupCard: { borderRadius: 20, padding: 16, gap: 10 },
  backupDue: { backgroundColor: colors.warnSoft },
  backupOk: { backgroundColor: colors.successSoft },
  backupTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: colors.ink },
  backupBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  list: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.raised, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.onPrimary },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  navValue: { fontFamily: fonts.bold, fontSize: 14 },
  autoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusPillText: { fontFamily: fonts.extrabold, fontSize: 12 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placeIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  placeTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  placeAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  placeActionText: { fontFamily: fonts.extrabold, fontSize: 13, color: colors.primary },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  segTextOn: { color: colors.onPrimary },
  footer: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
