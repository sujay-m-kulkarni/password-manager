import type { DB } from '@op-engineering/op-sqlite';
import { useRef } from 'react';
import { create } from 'zustand';
import { getSetting, setSetting } from '../db/database';
import { clearClipboardNow } from '../security/clipboard';
import { wipe, type Buffer } from '../security/crypto';
import { vaultExists } from '../security/keyHierarchy';
import { step } from '../utils/steps';

export type Status = 'loading' | 'setup' | 'locked' | 'unlocked';

type Settings = { autoLockSec: number; clipboardSec: number };

const DEFAULTS: Settings = { autoLockSec: 60, clipboardSec: 30 };

type Session = {
  status: Status;
  db: DB | null;
  /** The data key while unlocked (for fingerprint setup, recovery key, backups); wiped on lock. */
  dek: Buffer | null;
  /** >0 while Android's file picker or a fingerprint/phone-lock screen is open: don't lock on background. */
  autoLockPaused: number;
  settings: Settings;
  /** Bumped after every write so screens re-query. */
  dataVersion: number;
  init: () => void;
  unlocked: (db: DB, dek: Buffer) => void;
  /** Runs fn with auto-lock paused (Android screens that put Vault in the background). */
  withAutoLockPaused: <T>(fn: () => Promise<T>) => Promise<T>;
  /** keepClipboard: leave a just-copied password for its native timer (used on app background). */
  lock: (opts?: { keepClipboard?: boolean }) => void;
  touchData: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
};

export const useSession = create<Session>((set, get) => ({
  status: 'loading',
  db: null,
  dek: null,
  autoLockPaused: 0,
  settings: DEFAULTS,
  dataVersion: 0,

  init: () => {
    step('start: checking for a vault');
    const exists = vaultExists();
    step(exists ? 'start: vault found' : 'start: no vault (setup)');
    set({ status: exists ? 'locked' : 'setup' });
  },

  unlocked: (db: DB, dek: Buffer) => {
    const settings: Settings = {
      autoLockSec: Number(getSetting(db, 'auto_lock_sec') ?? DEFAULTS.autoLockSec),
      clipboardSec: Number(getSetting(db, 'clipboard_sec') ?? DEFAULTS.clipboardSec),
    };
    step('unlocked: opening the vault list');
    set({ db, dek, settings, status: 'unlocked' });
  },

  withAutoLockPaused: async fn => {
    set(s => ({ autoLockPaused: s.autoLockPaused + 1 }));
    try {
      return await fn();
    } finally {
      set(s => ({ autoLockPaused: Math.max(0, s.autoLockPaused - 1) }));
    }
  },

  lock: (opts?: { keepClipboard?: boolean }) => {
    const { db, dek } = get();
    wipe(dek);
    if (!opts?.keepClipboard) {
      clearClipboardNow();
    }
    if (db) {
      try {
        db.close(); // closing the handle is what locks the vault
      } catch {
        // already closed
      }
    }
    set({ db: null, dek: null, status: 'locked' });
  },

  touchData: () => set(s => ({ dataVersion: s.dataVersion + 1 })),

  updateSettings: patch => {
    const { db, settings } = get();
    const next = { ...settings, ...patch };
    if (db) {
      setSetting(db, 'auto_lock_sec', String(next.autoLockSec));
      setSetting(db, 'clipboard_sec', String(next.clipboardSec));
    }
    set({ settings: next });
  },
}));

/**
 * Use inside unlocked screens only. While a lock is in progress the unlocked screens
 * may render one last time before they unmount, so the last open handle is returned
 * instead of throwing (no new queries run, because the handle hasn't changed).
 */
export function useDb(): DB {
  const db = useSession(s => s.db);
  const last = useRef<DB | null>(db);
  if (db) {
    last.current = db;
  }
  if (!last.current) {
    throw new Error('Anchor is locked');
  }
  return last.current;
}
