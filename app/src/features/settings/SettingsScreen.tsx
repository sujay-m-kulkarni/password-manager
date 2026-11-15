import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, SectionLabel } from '../../components/ui';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';

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
  const settings = useSession(st => st.settings);
  const update = useSession(st => st.updateSettings);
  const lock = useSession(st => st.lock);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Settings</Text>

        <SectionLabel>Security</SectionLabel>
        <View style={s.card}>
          <Text style={s.rowLabel}>Auto-lock after inactivity</Text>
          <Segmented
            options={AUTO_LOCK}
            value={settings.autoLockSec}
            onChange={sec => update({ autoLockSec: sec })}
          />
          <Text style={s.hint}>The vault also locks as soon as you leave the app or the screen turns off.</Text>
        </View>
        <View style={s.card}>
          <Text style={s.rowLabel}>Clear clipboard after copying</Text>
          <Segmented
            options={CLIPBOARD}
            value={settings.clipboardSec}
            onChange={sec => update({ clipboardSec: sec })}
          />
        </View>

        <Button title="Lock now" variant="dark" onPress={() => lock()} />

        <Text style={s.footer}>Offline build · no internet permission · build steps 1–5</Text>
      </ScrollView>
    </SafeAreaView>
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
  content: { padding: 16, gap: 14 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, paddingHorizontal: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 12 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  segment: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 14, padding: 4, gap: 4 },
  segBtn: { flex: 1, height: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segBtnOn: { backgroundColor: colors.primary },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  segTextOn: { color: colors.white },
  footer: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
