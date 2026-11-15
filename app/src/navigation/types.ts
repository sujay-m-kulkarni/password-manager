import type { NavigatorScreenParams } from '@react-navigation/native';

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
  Edit: { id?: number; folderId?: number | null; kind?: 'login' | 'pin' };
};
