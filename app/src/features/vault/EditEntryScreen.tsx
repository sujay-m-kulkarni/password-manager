/** New entry: the entry form on its own screen. Editing a saved entry happens in place, on its page. */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../navigation/types';
import { useSession } from '../../store/session';
import { colors } from '../../theme';
import { EntryForm } from './EntryForm';

type Props = NativeStackScreenProps<RootStackParamList, 'Edit'>;

export function EditEntryScreen({ navigation, route }: Props) {
  const touchData = useSession(st => st.touchData);
  const cancel = useCallback(() => navigation.goBack(), [navigation]);
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <EntryForm
        existing={null}
        initialTab={route.params?.tab}
        initialType={route.params?.type}
        onCancel={cancel}
        onSaved={() => {
          touchData();
          // Back to the list of entries after saving.
          navigation.popTo('Tabs', { screen: 'Vault' });
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
