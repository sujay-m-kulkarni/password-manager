/**
 * Fingerprint / face (and optionally the phone's screen lock) instead of typing the master password.
 *
 * A copy of the data key is kept by react-native-keychain in the Android Keystore, in a
 * hardware-backed AES key that needs the user to authenticate before each use. Vault asks for
 * the master password again once a week, so it isn't forgotten.
 *
 * If the phone's screen lock is removed, Android deletes the Keystore key: unlocking then falls
 * back to the master password, and fingerprint can be turned on again from Settings.
 */
import * as Keychain from 'react-native-keychain';
import { Buffer } from './crypto';
import { LAST_PASSWORD_UNLOCK, getMeta, setMeta } from './keyHierarchy';
import { step } from '../utils/steps';

const SERVICE = 'vault.dek.biometric';
const ENABLED = 'biometric_enabled';
const PHONE_LOCK = 'biometric_phone_lock';
export const PASSWORD_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

export type BiometricSupport = { fingerprint: boolean; phoneLock: boolean };

export async function support(): Promise<BiometricSupport> {
  const [type, passcode] = await Promise.all([
    Keychain.getSupportedBiometryType().catch(() => null),
    Keychain.isPasscodeAuthAvailable().catch(() => false),
  ]);
  return { fingerprint: type != null, phoneLock: passcode };
}

export const isEnabled = () => getMeta(ENABLED) === '1';
export const allowsPhoneLock = () => getMeta(PHONE_LOCK) === '1';

const accessControl = (phoneLock: boolean) =>
  phoneLock
    ? Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE
    : Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET;

/** Stores the data key behind fingerprint (and phone lock if chosen). Throws if the user cancels. */
export async function enable(dek: Buffer, phoneLock: boolean): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => false);
  const ok = await Keychain.setGenericPassword('vault', dek.toString('base64'), {
    service: SERVICE,
    accessControl: accessControl(phoneLock),
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    storage: Keychain.STORAGE_TYPE.AES_GCM,
    authenticationPrompt: { title: 'Turn on unlock with fingerprint', cancel: 'Cancel' },
  });
  if (!ok) {
    throw new Error('Could not save the key.');
  }
  setMeta(ENABLED, '1');
  setMeta(PHONE_LOCK, phoneLock ? '1' : '0');
}

export async function disable(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE }).catch(() => false);
  setMeta(ENABLED, null);
  setMeta(PHONE_LOCK, null);
}

/** True when the weekly master-password check is due (or the password was never typed here). */
export function passwordDue(now = Date.now()): boolean {
  const last = Number(getMeta(LAST_PASSWORD_UNLOCK) ?? 0);
  return !last || now - last > PASSWORD_EVERY_MS;
}

export type BiometricUnlock =
  | { kind: 'ok'; dek: Buffer }
  | { kind: 'cancelled' }
  | { kind: 'unavailable'; message: string };

/** Asks for fingerprint / phone lock and returns the data key. */
export async function getDek(): Promise<BiometricUnlock> {
  step('fingerprint: asking');
  try {
    const cred = await Keychain.getGenericPassword({
      service: SERVICE,
      accessControl: accessControl(allowsPhoneLock()),
      authenticationPrompt: { title: 'Unlock Vault', cancel: 'Use master password' },
    });
    if (!cred) {
      await disable();
      return { kind: 'unavailable', message: 'Fingerprint unlock was reset. Use your master password, then turn it on again in Settings.' };
    }
    const dek = Buffer.from(cred.password, 'base64');
    if (dek.length !== 32) {
      await disable();
      return { kind: 'unavailable', message: 'Fingerprint unlock was reset. Use your master password.' };
    }
    return { kind: 'ok', dek };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel|negative|user/i.test(msg)) {
      return { kind: 'cancelled' };
    }
    if (/invalidat|permanently|not.*found|KeyPermanentlyInvalidated|no key/i.test(msg)) {
      await disable();
      return {
        kind: 'unavailable',
        message: 'Your phone\'s fingerprints or screen lock changed, so fingerprint unlock was turned off. Use your master password, then turn it on again in Settings.',
      };
    }
    return { kind: 'unavailable', message: `Fingerprint unlock failed (${msg}). Use your master password.` };
  }
}
