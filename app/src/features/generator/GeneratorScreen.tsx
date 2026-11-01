import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardToast } from '../../components/ClipboardToast';
import { copyWithAutoClear } from '../../security/clipboard';
import { useSession } from '../../store/session';
import { colors, fonts } from '../../theme';
import { GeneratorPanel } from './GeneratorPanel';

export function GeneratorScreen() {
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Generator</Text>
        <Text style={s.sub}>Made on this phone from the system's secure random source.</Text>
        <GeneratorPanel primaryAction={{ title: 'Copy password', onPress: pw => copyWithAutoClear(pw, clipboardSec) }} />
      </ScrollView>
      <ClipboardToast bottom={16} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 100 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink },
  sub: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, marginBottom: 8 },
});
