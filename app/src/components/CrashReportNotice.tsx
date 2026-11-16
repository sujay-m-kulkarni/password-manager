/**
 * Shown once on the launch after Vault closed unexpectedly, with Android's recorded reason,
 * so a crash can be reported without USB debugging. Share sends the text wherever the user
 * chooses (WhatsApp, email); nothing is sent automatically.
 */
import React, { useEffect, useState } from 'react';
import { NativeModules, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Button } from './ui';

export type CrashInfo = { reason: string; when: number; details: string; device: string; appVersion: string };

type CrashReportNative = { takeLastCrash(): Promise<CrashInfo | null> };

export async function takeLastCrash(): Promise<CrashInfo | null> {
  try {
    const native = NativeModules.CrashReport as CrashReportNative | undefined;
    return (await native?.takeLastCrash()) ?? null;
  } catch {
    return null;
  }
}

export function formatCrashReport(c: CrashInfo): string {
  return [
    `Vault ${c.appVersion} closed unexpectedly`,
    `When: ${new Date(c.when).toISOString()}`,
    `Reason: ${c.reason}`,
    `Device: ${c.device}`,
    '',
    c.details,
  ].join('\n');
}

export function CrashReportNotice() {
  const [crash, setCrash] = useState<CrashInfo | null>(null);

  useEffect(() => {
    takeLastCrash().then(setCrash);
  }, []);

  if (!crash) {
    return null;
  }
  const text = formatCrashReport(crash);

  return (
    <View style={StyleSheet.absoluteFill}>
      <SafeAreaView style={s.root}>
        <Text style={s.title}>Vault closed unexpectedly last time</Text>
        <Text style={s.body}>
          Your vault is safe. Please share this report so the problem can be fixed. It contains no passwords, only
          where in the app's code it stopped.
        </Text>
        <View style={s.reasonBox}>
          <Text style={s.reason}>{crash.reason}</Text>
          <Text style={s.when}>{new Date(crash.when).toLocaleString()}</Text>
        </View>
        <ScrollView style={s.details} contentContainerStyle={{ padding: 12 }}>
          <Text style={s.detailsText} selectable>
            {text}
          </Text>
        </ScrollView>
        <View style={s.actions}>
          <Button title="Share report" onPress={() => Share.share({ message: text }).catch(() => {})} />
          <Button title="Close" variant="ghost" onPress={() => setCrash(null)} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 12 },
  title: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted },
  reasonBox: { backgroundColor: colors.dangerSoft, borderRadius: 14, padding: 14, gap: 2 },
  reason: { fontFamily: fonts.bold, fontSize: 16, color: colors.danger },
  when: { fontFamily: fonts.regular, fontSize: 13, color: colors.danger },
  details: { flex: 1, backgroundColor: colors.surface, borderRadius: 14 },
  detailsText: { fontFamily: 'monospace', fontSize: 11, color: colors.inkSoft },
  actions: { gap: 8 },
});
