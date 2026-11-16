/**
 * Auto-lock: locks when the app goes to the background (which also covers screen off)
 * and after the inactivity timeout. Wrap the unlocked part of the app in this.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import { useSession } from '../store/session';

let activityPing: (() => void) | null = null;

/** Call from text inputs so typing (not just touching) counts as activity. */
export function pingActivity() {
  activityPing?.();
}

export function AutoLock({ children }: { children: React.ReactNode }) {
  const status = useSession(s => s.status);
  const lock = useSession(s => s.lock);
  const timeoutSec = useSession(s => s.settings.autoLockSec);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    if (status === 'unlocked') {
      timer.current = setTimeout(() => {
        // A file picker or fingerprint screen is open: wait for it instead of locking under it.
        if (useSession.getState().autoLockPaused > 0) {
          activityPing?.();
        } else {
          lock();
        }
      }, timeoutSec * 1000);
    }
  }, [lock, status, timeoutSec]);

  useEffect(() => {
    activityPing = reset;
    reset();
    return () => {
      activityPing = null;
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [reset]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') {
        // Lock the vault, but keep a just-copied password so it can be pasted in the
        // other app; the native timer clears it.
        const st = useSession.getState();
        if (st.status === 'unlocked' && st.autoLockPaused === 0) {
          lock({ keepClipboard: true });
        }
      }
    });
    return () => sub.remove();
  }, [lock]);

  return (
    <View
      style={{ flex: 1 }}
      // Observe every touch without stealing it, to reset the inactivity timer.
      onStartShouldSetResponderCapture={() => {
        reset();
        return false;
      }}>
      {children}
    </View>
  );
}
