import type { DB } from '@op-engineering/op-sqlite';
import { useRef } from 'react';
import { create } from 'zustand';
import { getSetting, setSetting } from '../db/database';
import { clearClipboardNow } from '../security/clipboard';
import { vaultExists } from '../security/keyHierarchy';

export type Status = 'loading' | 'setup' | 'locked' | 'unlocked';

type Settings = { autoLockSec: number; clipboardSec: number };

const DEFAULTS: Settings = { autoLockSec: 60, clipboardSec: 30 };

type Session = {
  status: Status;
  db: DB | null;
  settings: Settings;
  /** Bumped after every write so screens re-query. */
  dataVersion: number;
  init: () => void;
  unlocked: (db: DB) => void;
  /** keepClipboard: leave a just-copied password for its native timer (used on app background). */
  lock: (opts?: { keepClipboard?: boolean }) => void;
  touchData: () => void;
  updateSettings: (patch: Partial<Settings>) => void;
};

export const useSession = create<Session>((set, get) => ({
  status: 'loading',
  db: null,
  settings: DEFAULTS,
  dataVersion: 0,

  init: () => {
    set({ status: vaultExists() ? 'locked' : 'setup' });
  },

  unlocked: (db: DB) => {
    const settings: Settings = {
      autoLockSec: Number(getSetting(db, 'auto_lock_sec') ?? DEFAULTS.autoLockSec),
      clipboardSec: Number(getSetting(db, 'clipboard_sec') ?? DEFAULTS.clipboardSec),
    };
    set({ db, settings, status: 'unlocked' });
  },

  lock: (opts?: { keepClipboard?: boolean }) => {
    const { db } = get();
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
    set({ db: null, status: 'locked' });
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
    throw new Error('Vault is locked');
  }
  return last.current;
}
