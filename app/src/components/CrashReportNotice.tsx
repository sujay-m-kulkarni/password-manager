/**
 * Shown once on the launch after Vault closed unexpectedly, with Android's recorded reason,
 * so a crash can be reported without USB debugging. Share sends the text wherever the user
 * chooses (WhatsApp, email); nothing is sent automatically.
 */
import React, { useEffect, useState } from 'react';
import { NativeModules, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';
import { Button } from './ui';
import { recordedSteps, step } from '../utils/steps';

export type CrashInfo = { reason: string; when: number; details: string; device: string; appVersion: string };

type CrashReportNative = {
  takeLastCrash(): Promise<CrashInfo | null>;
  dismissCrash?(): void;
  saveReport?(reason: string, details: string): void;
};

const native = () => NativeModules.CrashReport as CrashReportNative | undefined;

/** The report stays until the user closes it, so a crash that repeats can still be shared. */
export function dismissCrash() {
  try {
    native()?.dismissCrash?.();
  } catch {
    // nothing to do
  }
}

/** Stores an in-app error so it is shown again on the next launch if the app is closed. */
export function saveReport(reason: string, details: string) {
  try {
    native()?.saveReport?.(reason, details);
  } catch {
    // nothing to do
  }
}

export async function takeLastCrash(): Promise<CrashInfo | null> {
  try {
    return (await native()?.takeLastCrash()) ?? null;
  } catch {
    return null;
  }
}

export function formatCrashReport(c: CrashInfo): string {
  return [
    `Anchor ${c.appVersion || ''} — report`,
    `When: ${new Date(c.when).toISOString()}`,
    `Reason: ${c.reason}`,
    `Device: ${c.device}`,
    '',
    c.details,
  ].join('\n');
}

/**
 * Safe start: checks for a crash report BEFORE anything else of the app runs (no vault, no unlock
 * screen), so a crash that happens on every launch can still be read and shared.
 */
export function CrashGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'none' | CrashInfo>('checking');

  useEffect(() => {
    takeLastCrash().then(c => {
      step(c ? 'showing crash report' : 'no crash report');
      setState(c ?? 'none');
    });
  }, []);

  if (state === 'checking') {
    return <View style={s.blank} />;
  }
  if (state !== 'none') {
    return (
      <CrashReportView
        crash={state}
        title="Anchor closed unexpectedly last time"
        onClose={() => {
          dismissCrash();
          setState('none');
        }}
      />
    );
  }
  return <>{children}</>;
}

/** Catches errors while drawing a screen: shows the report instead of the app closing. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { crash: CrashInfo | null }> {
  state = { crash: null as CrashInfo | null };

  static getDerivedStateFromError(e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      crash: {
        reason: 'App error',
        when: Date.now(),
        details: `${err.name}: ${err.message}\n${err.stack ?? ''}`,
        device: `Android ${Platform.Version}`,
        appVersion: '',
      },
    };
  }

  componentDidCatch(e: unknown, info: React.ErrorInfo) {
    const err = e instanceof Error ? e : new Error(String(e));
    const steps = recordedSteps();
    const details = `${err.name}: ${err.message}\n${err.stack ?? ''}\n\nScreen:${info.componentStack ?? ''}${
      steps ? `\n\nLast steps:\n${steps}` : ''
    }`;
    this.setState(st => (st.crash ? { crash: { ...st.crash, details } } : st));
    saveReport('App error', details);
  }

  render() {
    if (this.state.crash) {
      return (
        <CrashReportView
          crash={this.state.crash}
          title="Something went wrong"
          onClose={() => {
            dismissCrash();
            this.setState({ crash: null });
          }}
        />
      );
    }
    return this.props.children;
  }
}

function CrashReportView({ crash, title, onClose }: { crash: CrashInfo; title: string; onClose: () => void }) {
  const text = formatCrashReport(crash);
  return (
    <View style={StyleSheet.absoluteFill}>
      <SafeAreaView style={s.root}>
        <Text style={s.title}>{title}</Text>
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
          <Button title="Close" variant="ghost" onPress={onClose} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  blank: { flex: 1, backgroundColor: colors.bg },
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
