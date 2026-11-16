import { useState } from 'react';
import { Alert } from 'react-native';
import { backupFileName, createBackup, noteBackup } from '../../security/backup';
import { saveTextFile } from '../../security/files';
import { useDb, useSession } from '../../store/session';

/** Export an encrypted backup through Android's file picker; used by Settings and the reminder. */
export function useExportBackup() {
  const db = useDb();
  const dek = useSession(st => st.dek);
  const touchData = useSession(st => st.touchData);
  const [busy, setBusy] = useState(false);

  const exportNow = async () => {
    if (!dek) {
      return;
    }
    setBusy(true);
    try {
      const { text, entries } = createBackup(db, dek);
      const saved = await saveTextFile(backupFileName(), text);
      if (saved) {
        noteBackup(db);
        touchData();
        Alert.alert(
          'Backup saved',
          `${saved}\n${entries} ${entries === 1 ? 'entry' : 'entries'}, encrypted.\n\nKeep it off this phone, for example in Google Drive. It opens with your master password or recovery key.`,
        );
      }
    } catch (e) {
      Alert.alert('Backup not saved', e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return { exportNow, busy };
}
