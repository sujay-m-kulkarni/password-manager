/**
 * Save / open a backup through Android's file picker (android/.../files/VaultFilesModule.kt).
 * Opening the picker puts Vault in the background, so auto-lock is paused meanwhile.
 */
import { NativeModules } from 'react-native';
import { useSession } from '../store/session';

type VaultFilesNative = {
  saveText(fileName: string, text: string): Promise<{ name: string | null } | null>;
  openText(): Promise<{ name: string | null; text: string } | null>;
};

const native = () => {
  const m = NativeModules.VaultFiles as VaultFilesNative | undefined;
  if (!m) {
    throw new Error('Saving files is not available in this build.');
  }
  return m;
};

/** Resolves to the saved file's name, or null if cancelled. */
export function saveTextFile(fileName: string, text: string): Promise<string | null> {
  return useSession.getState().withAutoLockPaused(async () => {
    const r = await native().saveText(fileName, text);
    return r ? r.name ?? fileName : null;
  });
}

/** Resolves to the picked file, or null if cancelled. */
export function openTextFile(): Promise<{ name: string | null; text: string } | null> {
  return useSession.getState().withAutoLockPaused(() => native().openText());
}
