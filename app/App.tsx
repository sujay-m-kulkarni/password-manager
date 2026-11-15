import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SetupScreen } from './src/features/auth/SetupScreen';
import { UnlockScreen } from './src/features/auth/UnlockScreen';
import { GeneratorScreen } from './src/features/generator/GeneratorScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { EditEntryScreen } from './src/features/vault/EditEntryScreen';
import { EntryDetailScreen } from './src/features/vault/EntryDetailScreen';
import { VaultScreen } from './src/features/vault/VaultScreen';
import type { RootStackParamList, TabParamList } from './src/navigation/types';
import { AutoLock } from './src/security/AutoLock';
import { useSession } from './src/store/session';
import { colors, fonts } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

const TAB_GLYPH: Record<keyof TabParamList, string> = { Vault: '◈', Generator: '✦', Settings: '☰' };

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>{TAB_GLYPH[route.name]}</Text>,
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
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AutoLock>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  tabBar: { backgroundColor: colors.surface, borderTopColor: '#E4DFF5', height: 68, paddingTop: 6 },
  tabLabel: { fontFamily: fonts.bold, fontSize: 12 },
  tabIcon: { fontSize: 20 },
});
