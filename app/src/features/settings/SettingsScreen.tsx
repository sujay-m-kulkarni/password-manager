import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, SectionLabel } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';
import { backupDue, lastBackupAt } from '../../security/backup';
import * as Biometric from '../../security/biometric';
import { hasRecoveryKey } from '../../security/keyHierarchy';
import { useDb, useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { useExportBackup } from './useExportBackup';

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

  const [support, setSupport] = useState<Biometric.BiometricSupport | null>(null);
  const [bioOn, setBioOn] = useState(Biometric.isEnabled());
  const [phoneLock, setPhoneLock] = useState(Biometric.allowsPhoneLock());
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState(hasRecoveryKey());

  useEffect(() => {
    Biometric.support().then(setSupport);
    const unsub = navigation.addListener('focus', () => setRecovery(hasRecoveryKey()));
    return unsub;
  }, [navigation]);

  const last = useMemo(() => lastBackupAt(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const due = useMemo(() => backupDue(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

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

        <SectionLabel>Unlock</SectionLabel>
        <View style={s.card}>
          {!support ? null : !bioAvailable ? (
            <Text style={s.hint}>This phone has no fingerprint or screen lock set up. Add one in the phone's settings to unlock Vault without typing.</Text>
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
        {!recovery && <Banner tone="warn" text="No recovery key yet. Without one, a forgotten master password can't be undone." />}

        <SectionLabel>Backup</SectionLabel>
        <View style={s.list}>
          <NavRow label="Export encrypted backup" onPress={exportNow} />
          <NavRow label="Restore from a backup" onPress={() => navigation.navigate('Restore')} />
        </View>

        <Button title="Lock now" variant="dark" onPress={() => lock()} />
        <Text style={s.footer}>Offline build · no internet permission</Text>
      </ScrollView>
    </SafeAreaView>
  );
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
      <Text style={s.chevron}>›</Text>
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
  backupDue: { backgroundColor: colors.warn },
  backupOk: { backgroundColor: '#DDF5E5' },
  backupTitle: { fontFamily: fonts.extrabold, fontSize: 16, color: '#3B2402' },
  backupBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: '#3B2402' },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  list: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#D9D3F5', padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white },
  knobOn: { transform: [{ translateX: 20 }] },
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
  chevron: { fontSize: 22, color: colors.muted },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  segTextOn: { color: colors.white },
  footer: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
