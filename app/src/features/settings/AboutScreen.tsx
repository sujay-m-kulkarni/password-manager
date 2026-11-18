/**
 * Settings › About & what's new: the installed version, what Vault is, and what changed in each
 * release (from docs/CHANGELOG.md, the same text as the GitHub release notes). The installed
 * version is expanded; older ones open on tap.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/keyForms';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { CHANGELOG } from '../../generated/changelog';
import type { RootStackParamList } from '../../navigation/types';
import { colors, fonts } from '../../theme';
import { useAppVersion } from '../../utils/appVersion';

export function AboutScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'About'>) {
  const version = useAppVersion();
  const installed = version?.name ?? CHANGELOG[0]?.version ?? '';
  const [open, setOpen] = useState<string | null>(null);
  const isOpen = (v: string) => (open == null ? v === installed || v === CHANGELOG[0]?.version : open === v);

  return (
    <Screen title="About & what's new" onBack={() => navigation.goBack()}>
      <View style={s.card}>
        <Text style={s.appName}>{`Vault ${installed}`}</Text>
        <Text style={s.body}>
          A password manager that keeps everything encrypted on this phone. It has no internet permission, so nothing you save
          leaves the phone unless you export a backup.
        </Text>
        <Button title="How to use Vault" small variant="soft" onPress={() => navigation.navigate('Help')} style={{ alignSelf: 'flex-start' }} />
      </View>

      <Text style={s.section}>What's new</Text>
      {CHANGELOG.map(r => {
        const expanded = isOpen(r.version);
        return (
          <View key={r.version} style={s.release}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpen(expanded ? '' : r.version)}
              style={s.head}>
              <Text style={s.version}>{`Vault ${r.version}`}</Text>
              {r.version === installed && <Text style={s.badge}>Installed</Text>}
              <View style={{ flex: 1 }} />
              <Icon name={expanded ? 'minus' : 'plus'} size={20} color={colors.primary} strokeWidth={2.5} />
            </Pressable>
            {expanded && (
              <View style={s.points}>
                {r.points.map(p => (
                  <View key={p} style={s.point}>
                    <View style={s.dot} />
                    <Text style={s.pointText}>{p}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10 },
  appName: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  section: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, marginTop: 6, paddingHorizontal: 4 },
  release: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 16 },
  version: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  badge: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.success,
    backgroundColor: colors.successSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  points: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  point: { flexDirection: 'row', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  pointText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
});
