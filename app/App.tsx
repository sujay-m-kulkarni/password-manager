import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CrashReportNotice } from './src/components/CrashReportNotice';
import { SetupScreen } from './src/features/auth/SetupScreen';
import { HelpScreen } from './src/features/help/HelpScreen';
import { UnlockScreen } from './src/features/auth/UnlockScreen';
import { GeneratorScreen } from './src/features/generator/GeneratorScreen';
import { ChangePasswordScreen, RecoveryKeyScreen, RestoreScreen } from './src/features/settings/KeyScreens';
import { FoldersScreen } from './src/features/settings/FoldersScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { EditEntryScreen } from './src/features/vault/EditEntryScreen';
import { EntryDetailScreen } from './src/features/vault/EntryDetailScreen';
import { VaultScreen } from './src/features/vault/VaultScreen';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { AutoLock } from './src/security/AutoLock';
import { useSession } from './src/store/session';
import { colors, fonts } from './src/theme';
import { Icon, type IconName } from './src/components/Icon';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

const TAB_ICON: Record<keyof TabParamList, IconName> = { Vault: 'vault', Generator: 'sparkle', Settings: 'settings' };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => <Icon name={TAB_ICON[route.name]} color={color} />,
      })}>
      <Tab.Screen name="Vault" component={VaultScreen} />
      <Tab.Screen name="Generator" component={GeneratorScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const status = useSession(s => s.status);
  const init = useSession(s => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <AutoLock>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            {status === 'setup' && <Stack.Screen name="Setup" component={SetupScreen} />}
            {status === 'locked' && (
              <Stack.Screen name="Unlock" component={UnlockScreen} options={{ animationTypeForReplace: 'pop' }} />
            )}
            {status === 'unlocked' && (
              <>
                <Stack.Screen name="Tabs" component={Tabs} />
                <Stack.Screen name="Entry" component={EntryDetailScreen} />
                <Stack.Screen name="Edit" component={EditEntryScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                <Stack.Screen name="RecoveryKey" component={RecoveryKeyScreen} />
                <Stack.Screen name="Restore" component={RestoreScreen} />
                <Stack.Screen name="Folders" component={FoldersScreen} />
              </>
            )}
            {/* Readable before unlocking: instructions only, no vault data. */}
            <Stack.Screen name="Help" component={HelpScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AutoLock>
      <CrashReportNotice />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  tabBar: { backgroundColor: colors.surface, borderTopColor: '#E4DFF5', height: 68, paddingTop: 6 },
  tabLabel: { fontFamily: fonts.bold, fontSize: 12 },
});
