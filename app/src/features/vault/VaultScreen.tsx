import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardToast } from '../../components/ClipboardToast';
import { SectionLabel } from '../../components/ui';
import {
  countEntries,
  getPassword,
  listEntries,
  listFolders,
  type EntryListItem,
} from '../../db/database';
import { pingActivity } from '../../security/AutoLock';
import { copyWithAutoClear } from '../../security/clipboard';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

export function VaultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const db = useDb();
  const lock = useSession(st => st.lock);
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  const dataVersion = useSession(st => st.dataVersion);
  const [search, setSearch] = useState('');
  const [folderId, setFolderId] = useState<number | null>(null);

  const folders = useMemo(() => listFolders(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => countEntries(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(
    () => listEntries(db, search, folderId),
    [db, search, folderId, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const browsing = !search.trim() && folderId == null;
  const favorites = browsing ? items.filter(i => i.favorite) : [];

  const copy = (id: number) => {
    const pw = getPassword(db, id);
    if (pw != null) {
      copyWithAutoClear(pw, clipboardSec);
    }
  };

  const Header = (
    <View style={{ gap: 12 }}>
      {favorites.length > 0 && (
        <>
          <SectionLabel>Favorites</SectionLabel>
          <View style={s.favGrid}>
            {favorites.slice(0, 4).map(f => {
              const c = folderColor(f.folder_color);
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="button"
                  onPress={() => navigation.navigate('Entry', { id: f.id })}
                  style={[s.favTile, { backgroundColor: c.solid }]}>
                  <View style={s.favTop}>
                    <View style={s.favInitial}>
                      <Text style={[s.favInitialText, { color: c.ink }]}>{initial(f.title)}</Text>
                    </View>
                    <Text style={s.star}>★</Text>
                  </View>
                  <Text style={s.favTitle} numberOfLines={1}>
                    {f.title}
                  </Text>
                  <Text style={s.favUser} numberOfLines={1}>
                    {f.username ?? ' '}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
      <SectionLabel>{browsing ? 'All items' : `${items.length} found`}</SectionLabel>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <View>
          <Text style={s.count}>
            {total} {total === 1 ? 'password' : 'passwords'}
          </Text>
          <Text style={s.title}>My Vault</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <HeaderButton label="Lock vault" text="Lock" onPress={() => lock()} />
        </View>
      </View>

      <View style={s.searchWrap}>
        <TextInput
          value={search}
          onChangeText={t => {
            pingActivity();
            setSearch(t);
          }}
          placeholder="Search passwords"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search passwords"
          autoCorrect={false}
          autoCapitalize="none"
          style={s.search}
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip label="All" active={folderId == null} onPress={() => setFolderId(null)} />
          {folders.map(f => (
            <Chip key={f.id} label={f.name} color={f.color} active={folderId === f.id} onPress={() => setFolderId(f.id)} />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => String(i.id)}
        ListHeaderComponent={Header}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          <Text style={s.empty}>{browsing ? 'No passwords yet. Tap + to add your first one.' : 'Nothing matches.'}</Text>
        }
        renderItem={({ item }) => (
          <Row item={item} onOpen={() => navigation.navigate('Entry', { id: item.id })} onCopy={() => copy(item.id)} />
        )}
      />

      <ClipboardToast bottom={28} right={92} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add password"
        onPress={() => navigation.navigate('Edit', { folderId })}
        style={s.fab}>
        <Text style={s.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Row({ item, onOpen, onCopy }: { item: EntryListItem; onOpen: () => void; onCopy: () => void }) {
  const c = folderColor(item.folder_color);
  return (
    <View style={s.row}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={s.rowMain}>
        <View style={[s.avatar, { backgroundColor: c.soft }]}>
          <Text style={[s.avatarText, { color: c.ink }]}>{initial(item.title)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {!!item.username && (
            <Text style={s.rowUser} numberOfLines={1}>
              {item.username}
            </Text>
          )}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Copy password for ${item.title}`} onPress={onCopy} style={s.copyBtn}>
        <Text style={s.copyText}>Copy</Text>
      </Pressable>
    </View>
  );
}

function Chip({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  const c = folderColor(color);
  const bg = active ? (color ? c.solid : colors.primary) : color ? c.soft : colors.surface;
  const fg = active ? colors.white : color ? c.ink : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: bg }]}>
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function HeaderButton({ label, text, onPress }: { label: string; text: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.headerBtn}>
      <Text style={s.headerBtnText}>{text}</Text>
    </Pressable>
  );
}

const Separator = () => <View style={s.sep} />;

const initial = (t: string) => (t.trim()[0] ?? '?').toUpperCase();

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  sep: { height: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10 },
  count: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink },
  headerBtn: { minWidth: 44, height: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  headerBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.primary },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  search: { height: 48, borderRadius: 14, backgroundColor: colors.surface, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 16, color: colors.ink },
  chips: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bold, fontSize: 14 },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 0 },
  favGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  favTile: { width: '48%', flexGrow: 1, borderRadius: 18, padding: 14, gap: 4 },
  favTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  favInitial: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  favInitialText: { fontFamily: fonts.extrabold, fontSize: 16 },
  star: { fontSize: 18, color: colors.warn },
  favTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  favUser: { fontFamily: fonts.regular, fontSize: 13, color: '#F1EEFF' },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, paddingLeft: 12, paddingRight: 6 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 16 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  rowUser: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  copyBtn: { minWidth: 56, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  copyText: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 40 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
  fabText: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 34, color: colors.white },
});
