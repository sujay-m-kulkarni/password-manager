/**
 * Keeps backups up to date while the vault is unlocked. Renders nothing.
 *
 * 1.9.0, daily backup: on unlocking, the daily alarm is (re)set from the settings, and after every
 * change the encrypted snapshot the alarm copies is refreshed. The folder and the off-phone file are
 * written by the alarm at the chosen time (or by Back up now), not on every change.
 *
 * Builds without the daily backup keep the 1.4 behaviour: a backup in the folder after each change.
 */
import { useEffect, useRef } from 'react';
import { useSession } from '../store/session';
import { autoBackupState, changedSinceAutoBackup, runAutoBackup } from './autoBackup';
import { canBackUpDaily, configureDaily, prepareSnapshot } from './dailyBackup';

const DELAY_MS = 600; // a burst of changes (e.g. a restore) makes one backup

export function AutoBackup() {
  const db = useSession(st => st.db);
  const dek = useSession(st => st.dek);
  const dataVersion = useSession(st => st.dataVersion);
  const first = useRef(true);
  const running = useRef(false);

  useEffect(() => {
    if (!db || !dek) {
      return;
    }
    const daily = canBackUpDaily();
    if (!daily && !autoBackupState(db)) {
      return;
    }
    const isFirst = first.current;
    first.current = false;
    if (!daily && isFirst && !changedSinceAutoBackup(db)) {
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
        if (st.db !== db || !st.dek) {
          return;
        }
        if (daily) {
          await prepareSnapshot(db, st.dek);
          if (isFirst) {
            await configureDaily(db).catch(() => null);
          }
        } else {
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
