/**
 * Copy with auto-clear. Uses the app's own SecureClipboard native module
 * (android/app/src/main/java/com/vaultapp/secureclipboard) so no third-party
 * clipboard package is needed. Copied text is marked sensitive on Android 13+.
 *
 * The clear timer runs NATIVELY, so it still fires after the user switches to another
 * app to paste (JS timers pause in the background). Going to the background therefore
 * locks the vault but does NOT clear the clipboard immediately — that would break the
 * unlock → copy → paste workflow. An explicit "Lock" does clear it right away.
 */
import { NativeModules } from 'react-native';

type SecureClipboardNative = {
  copySensitive(text: string, clearAfterMs: number): Promise<void>;
  clearIfOurs(): Promise<void>;
};

const Native = NativeModules.SecureClipboard as SecureClipboardNative;

// JS side only drives the on-screen countdown.
let uiTimer: ReturnType<typeof setTimeout> | null = null;
let listeners: Array<(endsAt: number | null) => void> = [];
let endsAt: number | null = null;

function setEndsAt(v: number | null) {
  endsAt = v;
  listeners.forEach(l => l(endsAt));
}

export function onClipboardCountdown(l: (endsAt: number | null) => void) {
  listeners.push(l);
  l(endsAt);
  return () => {
    listeners = listeners.filter(x => x !== l);
  };
}

export async function copyWithAutoClear(text: string, clearAfterSec: number) {
  await Native.copySensitive(text, clearAfterSec * 1000);
  if (uiTimer) {
    clearTimeout(uiTimer);
  }
  setEndsAt(Date.now() + clearAfterSec * 1000);
  uiTimer = setTimeout(() => setEndsAt(null), clearAfterSec * 1000);
}

/** Clears immediately (if the clipboard still holds our clip). */
export async function clearClipboardNow() {
  if (uiTimer) {
    clearTimeout(uiTimer);
    uiTimer = null;
  }
  setEndsAt(null);
  try {
    await Native.clearIfOurs();
  } catch {
    // best effort
  }
}
