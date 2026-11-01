import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SetupScreen } from './src/features/auth/SetupScreen';
import { UnlockScreen } from './src/features/auth/UnlockScreen';
import { SettingsScreen } from './src/features/settings/SettingsScreen';
import { EditEntryScreen } from './src/features/vault/EditEntryScreen';
import { EntryDetailScreen } from './src/features/vault/EntryDetailScreen';
import { VaultScreen } from './src/features/vault/VaultScreen';
import type { RootStackParamList } from './src/navigation/types';
import { AutoLock } from './src/security/AutoLock';
import { useSession } from './src/store/session';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg } };

export default function App() {
  const status = useSession(s => s.status);
  const init = useSession(s => s.init);

  useEffect(() => {
    init();
  }, [init]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
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
                <Stack.Screen name="Vault" component={VaultScreen} />
                <Stack.Screen name="Entry" component={EntryDetailScreen} />
                <Stack.Screen name="Edit" component={EditEntryScreen} options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </AutoLock>
    </SafeAreaProvider>
  );
}
