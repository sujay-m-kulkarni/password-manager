/**
 * Runs the automatic backup while the vault is unlocked: right after unlocking if entries changed
 * since the last one, and shortly after every change (add, edit, delete, folders, restore).
 * Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { useSession } from '../store/session';
import { autoBackupState, changedSinceAutoBackup, runAutoBackup } from './autoBackup';

const DELAY_MS = 600; // a burst of changes (e.g. a restore) makes one backup

export function AutoBackup() {
  const db = useSession(st => st.db);
  const dek = useSession(st => st.dek);
  const dataVersion = useSession(st => st.dataVersion);
  const first = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    if (!db || !dek || !autoBackupState(db)) {
      return;
    }
    const isFirst = first.current;
    first.current = false;
    if (isFirst && !changedSinceAutoBackup(db)) {
      return;
    }
    const t = setTimeout(async () => {
      if (running.current) {
        return;
      }
      running.current = true;
      try {
        // Still unlocked with the same vault?
        const st = useSession.getState();
        if (st.db === db && st.dek) {
          await runAutoBackup(db, st.dek);
        }
      } finally {
        running.current = false;
      }
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [db, dek, dataVersion]);

  return null;
}
