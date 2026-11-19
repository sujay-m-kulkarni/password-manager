/**
 * Settings › Entry types: each type's starting fields (what a new entry of that type shows on its
 * Login tab). Rename, add, remove, reorder, choose Text / Number / Hidden, or reset to Vault's list.
 * Existing entries keep their own fields; when edited they also show starting fields they lack.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/keyForms';
import { Icon } from '../../components/Icon';
import { Banner, Button, Field } from '../../components/ui';
import {
  DEFAULT_FIELDS,
  FIELD_KINDS,
  FIELD_NAME_MAX,
  getTypeFields,
  resetTypeFields,
  setTypeFields,
  type FieldSpec,
} from '../../customFields';
import { ENTRY_TYPES, typeInfo } from '../../entryTypes';
import type { RootStackParamList } from '../../navigation/types';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';

export function EntryTypesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'EntryTypes'>) {
  const db = useDb();
  const dataVersion = useSession(st => st.dataVersion);
  const counts = useMemo(
    () => Object.fromEntries(ENTRY_TYPES.map(t => [t.key, getTypeFields(db, t.key).length])),
    [db, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return (
    <Screen
      title="Entry types"
      body="The fields each type starts with. A new entry shows them on its Login tab; empty ones are not saved."
      onBack={() => navigation.goBack()}>
      <View style={st.list}>
        {ENTRY_TYPES.map(t => {
          const c = folderColor(t.color);
          const n = counts[t.key];
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              onPress={() => navigation.navigate('TypeFields', { type: t.key })}
              style={st.row}>
              <View style={[st.swatch, { backgroundColor: c.solid }]} />
              <Text style={st.name}>{t.label}</Text>
              <Text style={st.count}>{n === 0 ? 'No fields' : n === 1 ? '1 field' : `${n} fields`}</Text>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

export function TypeFieldsScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'TypeFields'>) {
  const db = useDb();
  const touchData = useSession(st => st.touchData);
  const type = route.params.type;
  const info = typeInfo(type);
  const [list, setList] = useState<FieldSpec[]>(() => getTypeFields(db, type));
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<FieldSpec>) => setList(prev => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: -1 | 1) =>
    setList(prev => {
      const j = i + by;
      if (j < 0 || j >= prev.length) {
        return prev;
      }
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    try {
      setTypeFields(db, type, list);
      touchData();
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const reset = () =>
    Alert.alert(`Reset ${info.label} fields?`, `Back to Anchor's list of ${DEFAULT_FIELDS[type].length} fields. Saved entries keep their values.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetTypeFields(db, type);
          touchData();
          setList(getTypeFields(db, type));
        },
      },
    ]);

  return (
    <Screen
      kicker="Entry types"
      title={info.label}
      body="Changes apply to new entries. Saved entries keep their fields and values."
      onBack={() => navigation.goBack()}>
      {list.length === 0 && <Text style={st.hint}>No starting fields. Add some, or use “+ Add field” on each entry.</Text>}
      {list.map((f, i) => (
        <View key={i} style={st.card}>
          <View style={st.cardTop}>
            <View style={{ flex: 1 }}>
              <Field label={`Field ${i + 1}`} value={f.name} onChangeText={t => update(i, { name: t })} maxLength={FIELD_NAME_MAX} importantForAutofill="no" />
            </View>
            <View style={st.order}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Move ${f.name || 'field'} up`} disabled={i === 0} onPress={() => move(i, -1)} style={[st.orderBtn, i === 0 && st.off]}>
                <Text style={st.orderText}>↑</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${f.name || 'field'} down`}
                disabled={i === list.length - 1}
                onPress={() => move(i, 1)}
                style={[st.orderBtn, i === list.length - 1 && st.off]}>
                <Text style={st.orderText}>↓</Text>
              </Pressable>
            </View>
          </View>
          <View style={st.kinds} accessibilityRole="radiogroup">
            {FIELD_KINDS.map(k => (
              <KindChip key={k.kind} label={k.label} active={f.kind === k.kind} onPress={() => update(i, { kind: k.kind })} />
            ))}
            <View style={{ flex: 1 }} />
            <Button title="Remove" small variant="ghost" onPress={() => setList(prev => prev.filter((_, j) => j !== i))} />
          </View>
        </View>
      ))}
      <Button title="+ Add field" variant="soft" onPress={() => setList(prev => [...prev, { name: '', kind: 'text' }])} />
      {error && <Banner text={error} />}
      <View style={st.actions}>
        <Button title="Save" onPress={save} style={{ flex: 1 }} />
        <Button title="Reset to default" variant="ghost" onPress={reset} />
      </View>
    </Screen>
  );
}

function KindChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[st.kind, active && st.kindOn]}>
      <Text style={[st.kindText, active && st.kindTextOn]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  list: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  swatch: { width: 14, height: 14, borderRadius: 5 },
  name: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  count: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  hint: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  order: { flexDirection: 'row', gap: 4 },
  orderBtn: { width: 44, height: 52, borderRadius: 14, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  orderText: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  kinds: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  kind: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  kindOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  kindTextOn: { color: colors.onPrimary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
