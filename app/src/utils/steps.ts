import { NativeModules } from 'react-native';

type Native = { mark?: (step: string) => boolean; steps?: () => string };
const native = () => NativeModules.CrashReport as Native | undefined;

/**
 * Records what the app is doing, so a crash report can say where it stopped.
 * Step names and counts only: never titles, usernames or secrets.
 */
export function step(name: string) {
  try {
    native()?.mark?.(name);
  } catch {
    // diagnostics must never break the app
  }
}

export function recordedSteps(): string {
  try {
    return native()?.steps?.() ?? '';
  } catch {
    return '';
  }
}
