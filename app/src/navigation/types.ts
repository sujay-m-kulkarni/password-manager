import type { NavigatorScreenParams } from '@react-navigation/native';
import type { EntryType } from '../entryTypes';

export type TabParamList = {
  Vault: undefined;
  Generator: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Setup: undefined;
  Unlock: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Entry: { id: number };
  Edit: { tab?: 'login' | 'pins' | 'cards'; type?: EntryType };
  ChangePassword: undefined;
  RecoveryKey: undefined;
  Restore: undefined;
  Help: undefined;
};
