import { useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

export type AppVersion = { name: string; code: number };

/** The installed app's version as Android knows it (set by the pipeline at build time). */
export async function getAppVersion(): Promise<AppVersion | null> {
  try {
    const m = NativeModules.CrashReport as { getAppVersion?: () => Promise<AppVersion | null> } | undefined;
    return (await m?.getAppVersion?.()) ?? null;
  } catch {
    return null;
  }
}

export function useAppVersion(): AppVersion | null {
  const [v, setV] = useState<AppVersion | null>(null);
  useEffect(() => {
    getAppVersion().then(setV);
  }, []);
  return v;
}
