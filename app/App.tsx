import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CrashGate, ErrorBoundary } from './src/components/CrashReportNotice';
import { SetupScreen } from './src/features/auth/SetupScreen';
import { HelpScreen } from './src/features/help/HelpScreen';
import { UnlockScreen } from './src/features/auth/UnlockScreen';
import { ChangePasswordScreen, RecoveryKeyScreen, RestoreScreen } from './src/features/settings/KeyScreens';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { EditEntryScreen } from './src/features/vault/EditEntryScreen';
import { EntryDetailScreen } from './src/features/vault/EntryDetailScreen';
import { VaultScreen } from './src/features/vault/VaultScreen';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { AutoBackup } from './src/security/AutoBackup';
import { currentGate, type Gate } from './src/security/dailyBackup';
import { FamilyScreen } from './src/features/family/FamilyScreen';
import { BackupSetupScreen } from './src/features/settings/BackupSetupScreen';
import { AutoLock } from './src/security/AutoLock';
import { useSession } from './src/store/session';
import { colors, fonts } from './src/theme';
import { Icon, type IconName } from './src/components/Icon';
import { APP_NAME } from './src/brand';
import { AboutScreen } from './src/features/settings/AboutScreen';
import { EntryTypesScreen, TypeFieldsScreen } from './src/features/settings/EntryTypesScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.surface, text: colors.ink, primary: colors.primary, border: colors.border },
};

const TAB_ICON: Record<keyof TabParamList, IconName> = { Vault: 'vault', Family: 'family', Settings: 'settings' };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarLabel: route.name === 'Vault' ? APP_NAME : route.name,
        tabBarIcon: ({ color, focused }) => (
          <View style={[styles.tabIcon, focused && styles.tabIconOn]}>
            <Icon name={TAB_ICON[route.name]} color={color} size={22} />
          </View>
        ),
      })}>
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Family" component={FamilyScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CrashGate>
        <ErrorBoundary>
          <VaultApp />
        </ErrorBoundary>
      </CrashGate>
    </SafeAreaProvider>
  );
}

/**
 * 1.9.0: after unlocking, Vault opens only once a daily backup is set up (and only while the copy
 * off the phone isn't more than 30 days behind). Re-checked after every change.
 */
function useBackupGate(): Gate | 'checking' {
  const status = useSession(s => s.status);
  const db = useSession(s => s.db);
  const dataVersion = useSession(s => s.dataVersion);
  const [gate, setGate] = useState<Gate | 'checking'>('checking');
  useEffect(() => {
    if (status !== 'unlocked' || !db) {
      setGate('checking');
      return;
    }
    let live = true;
    currentGate(db)
      .catch((): Gate => 'ok')
      .then(g => live && setGate(g));
    return () => {
      live = false;
    };
  }, [status, db, dataVersion]);
  return gate;
}

function VaultApp() {
  const status = useSession(s => s.status);
  const init = useSession(s => s.init);
  const gate = useBackupGate();
  const gated = gate === 'setup' || gate === 'blocked';

  useEffect(() => {
    init();
  }, [init]);

  if (status === 'loading' || (status === 'unlocked' && gate === 'checking')) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      {status === 'unlocked' && <AutoBackup />}
      <AutoLock>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            {status === 'setup' && <Stack.Screen name="Setup" component={SetupScreen} />}
            {status === 'locked' && (
              <Stack.Screen name="Unlock" component={UnlockScreen} options={{ animationTypeForReplace: 'pop' }} />
            )}
            {status === 'unlocked' && gated && (
              <Stack.Screen name="BackupSetup" component={BackupSetupScreen} initialParams={{ mode: gate === 'blocked' ? 'blocked' : 'setup' }} />
            )}
            {status === 'unlocked' && !gated && (
              <>
                <Stack.Screen name="Tabs" component={Tabs} />
                <Stack.Screen name="Entry" component={EntryDetailScreen} />
                <Stack.Screen name="Edit" component={EditEntryScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                <Stack.Screen name="RecoveryKey" component={RecoveryKeyScreen} />
                <Stack.Screen name="Restore" component={RestoreScreen} />
                <Stack.Screen name="EntryTypes" component={EntryTypesScreen} />
                <Stack.Screen name="TypeFields" component={TypeFieldsScreen} />
              </>
            )}
            {/* Readable before unlocking: instructions only, no vault data. */}
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="About" component={AboutScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AutoLock>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.divider, height: 76, paddingTop: 8, paddingBottom: 10 },
  tabLabel: { fontFamily: fonts.bold, fontSize: 12, marginTop: 2 },
  tabIcon: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: colors.accentTint },
});
