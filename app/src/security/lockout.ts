/**
 * Failed-attempt lockout with increasing delays.
 *
 * Stored in the Android Keystore-backed Keychain so it survives app restarts.
 * It does NOT survive "Clear data" or a reinstall (Android wipes the app's Keystore
 * entries), so it is a deterrent against someone holding the phone — not protection
 * for the vault file. The real defence is Argon2id cost + a strong master password.
 */
import * as Keychain from 'react-native-keychain';

const SERVICE = 'vault.lockout';
const FREE_ATTEMPTS = 3;
const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

type State = { failures: number; nextAllowedAt: number };

async function read(): Promise<State> {
  try {
    const c = await Keychain.getGenericPassword({ service: SERVICE });
    if (c) {
      return JSON.parse(c.password) as State;
    }
  } catch {
    // fall through to a clean state
  }
  return { failures: 0, nextAllowedAt: 0 };
}

async function write(s: State) {
  await Keychain.setGenericPassword('lockout', JSON.stringify(s), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Milliseconds the user must still wait (0 = may try now). */
export async function remainingWaitMs(now = Date.now()): Promise<number> {
  const s = await read();
  return Math.max(0, s.nextAllowedAt - now);
}

export async function failureCount(): Promise<number> {
  return (await read()).failures;
}

export async function recordFailure(now = Date.now()): Promise<{ failures: number; waitMs: number }> {
  const s = await read();
  const failures = s.failures + 1;
  let waitMs = 0;
  if (failures >= FREE_ATTEMPTS) {
    // 30s, 60s, 2m, 4m … capped at 15m
    waitMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS));
  }
  await write({ failures, nextAllowedAt: now + waitMs });
  return { failures, waitMs };
}

export async function recordSuccess() {
  await write({ failures: 0, nextAllowedAt: 0 });
}
