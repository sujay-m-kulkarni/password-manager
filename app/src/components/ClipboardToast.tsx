import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { onClipboardCountdown } from '../security/clipboard';
import { useSession } from '../store/session';
import { colors, fonts } from '../theme';

/** "Password copied · clears in 24s" with a shrinking bar. */
export function ClipboardToast({ bottom = 24, right = 16 }: { bottom?: number; right?: number }) {
  const total = useSession(st => st.settings.clipboardSec);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => onClipboardCountdown(setEndsAt), []);
  useEffect(() => {
    if (endsAt == null) {
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);

  if (endsAt == null) {
    return null;
  }
  const leftMs = Math.max(0, endsAt - now);
  const pct = Math.min(1, leftMs / (total * 1000));

  return (
    <View style={[s.toast, { bottom, right }]} accessibilityLiveRegion="polite">
      <View style={s.row}>
        <Text style={s.text}>Copied</Text>
        <Text style={[s.text, { color: colors.warn }]}>clears in {Math.ceil(leftMs / 1000)}s</Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct * 100}%` }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  toast: { position: 'absolute', left: 16, backgroundColor: colors.ink, borderRadius: 14, padding: 12, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  text: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.inkSoft },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.warn },
});
