/**
 * The home list (refreshed in 1.10.0, design I): name and totals, a backup status strip, search,
 * type filters with icons, favourites and recently used, then entries grouped by type, each with a
 * one-tap copy button.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_NAME } from '../../brand';
import { ClipboardToast } from '../../components/ClipboardToast';
import { Icon, type IconName } from '../../components/Icon';
import { getQuickSecret, listEntries, listRecent, markUsed, vaultTotals, type EntryListItem } from '../../db/database';
import { ENTRY_TYPES, typeInfo, type EntryType } from '../../entryTypes';
import type { RootStackParamList } from '../../navigation/types';
import { pingActivity } from '../../security/AutoLock';
import { backupDue } from '../../security/backup';
import { copyWithAutoClear } from '../../security/clipboard';
import {
  canBackUpDaily,
  currentGate,
  dailyStatus,
  offPhoneState,
  saveOffPhoneCopy,
  type DailyStatus,
} from '../../security/dailyBackup';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { step } from '../../utils/steps';
import { useExportBackup } from '../settings/useExportBackup';

type Section = { key: string; title: string; data: EntryListItem[] };

export function VaultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const db = useDb();
  const lock = useSession(st => st.lock);
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  const dataVersion = useSession(st => st.dataVersion);
  const touchData = useSession(st => st.touchData);
  const dek = useSession(st => st.dek);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<EntryType | null>(null);
  const [pinsOnly, setPinsOnly] = useState(false);
  const [used, setUsed] = useState(0); // re-reads "Recently used" after a copy
  useState(() => step('vault list: reading entries')); // once, before the first queries

  const totals = useMemo(() => vaultTotals(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(
    () => listEntries(db, search, null, pinsOnly, type),
    [db, search, type, pinsOnly, dataVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const browsing = !search.trim() && type == null && !pinsOnly;
  const favorites = browsing ? items.filter(i => i.favorite).slice(0, 6) : [];
  const recent = useMemo(
    () => (browsing ? listRecent(db, 6).filter(r => !r.favorite).slice(0, 3) : []),
    [db, browsing, dataVersion, used], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const sections: Section[] = useMemo(() => {
    if (!browsing) {
      const title = type ? typeInfo(type).label : pinsOnly ? 'PINs' : 'Found';
      return items.length ? [{ key: 'found', title: `${title} · ${items.length}`, data: items }] : [];
    }
    return ENTRY_TYPES.map(t => ({ key: t.key, title: t.label, data: items.filter(i => typeInfo(i.type).key === t.key) })).filter(
      sec => sec.data.length > 0,
    );
  }, [items, browsing, type, pinsOnly]);

  useEffect(() => {
    step(`vault list shown: ${totals.entries} entries, ${favorites.length} favourites`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Backup status (daily backup builds) or the older export reminder.
  const daily = canBackUpDaily();
  const oldRemind = useMemo(() => !daily && backupDue(db), [db, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const [status, setStatus] = useState<DailyStatus | null>(null);
  const [driveRemind, setDriveRemind] = useState(false);
  useEffect(() => {
    let live = true;
    if (daily) {
      dailyStatus().then(st => live && setStatus(st));
      currentGate(db)
        .then(g => live && setDriveRemind(g === 'remind'))
        .catch(() => null);
    }
    return () => {
      live = false;
    };
  }, [db, dataVersion, daily]);

  const { exportNow: exportFile, busy: exportingFile } = useExportBackup();
  const [savingDrive, setSavingDrive] = useState(false);
  const exporting = daily ? savingDrive : exportingFile;
  const saveBackup = async () => {
    if (!daily) {
      return exportFile();
    }
    if (!dek) {
      return;
    }
    setSavingDrive(true);
    try {
      await saveOffPhoneCopy(db, dek);
    } catch {
      // Settings shows details; the reminder simply stays
    } finally {
      setSavingDrive(false);
      touchData();
    }
  };

  const copy = (id: number) => {
    const secret = getQuickSecret(db, id);
    if (secret) {
      copyWithAutoClear(secret.value, clipboardSec);
      markUsed(db, id);
      setUsed(u => u + 1);
    }
  };
  const open = (id: number) => navigation.navigate('Entry', { id });

  const off = daily ? offPhoneState(db) : null;
  const lastOk = Math.max(status?.folderOkAt ?? 0, status?.driveOkAt ?? 0, off?.savedAt ?? 0);

  const Header = (
    <View style={{ gap: 14 }}>
      {browsing && daily && driveRemind && (
        <Strip tone="warn" text="Your Google Drive copy is over a week behind your changes." action={exporting ? 'Saving…' : 'Save'} onPress={saveBackup} />
      )}
      {browsing && daily && !driveRemind && status?.error && (
        <Strip tone="danger" text="The last daily backup had a problem." action="Details" onPress={() => navigation.navigate('Tabs', { screen: 'Settings' })} />
      )}
      {browsing && daily && !driveRemind && !status?.error && lastOk > 0 && (
        <Strip tone="ok" text={`Backed up ${when(lastOk)}${off ? ` · phone + ${off.place}` : ''}`} />
      )}
      {browsing && oldRemind && (
        <Strip
          tone="warn"
          text="Back up your vault: export an encrypted copy and keep it off this phone."
          action={exporting ? 'Saving…' : 'Export'}
          onPress={saveBackup}
        />
      )}
      {favorites.length > 0 && <Tiles label="FAVOURITES" items={favorites} onOpen={open} star />}
      {recent.length > 0 && <Tiles label="RECENTLY USED" items={recent} onOpen={open} />}
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{APP_NAME}</Text>
          <Text style={s.count}>
            {totals.entries === 0
              ? 'Nothing saved yet'
              : [
                  plural(totals.entries, 'entry', 'entries'),
                  totals.pins ? plural(totals.pins, 'PIN', 'PINs') : null,
                  totals.cards ? plural(totals.cards, 'card', 'cards') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Lock vault" onPress={() => lock()} style={s.roundBtn}>
          <Icon name="lock" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={s.searchWrap}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={t => {
            pingActivity();
            setSearch(t);
          }}
          placeholder="Search names, usernames, fields"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Search passwords"
          autoCorrect={false}
          autoCapitalize="none"
          style={s.search}
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
          <Chip
            label="All"
            active={type == null && !pinsOnly}
            onPress={() => {
              setType(null);
              setPinsOnly(false);
            }}
          />
          {ENTRY_TYPES.map(t => (
            <Chip
              key={t.key}
              label={t.label}
              color={t.color}
              icon={t.icon}
              active={type === t.key}
              onPress={() => {
                setType(type === t.key ? null : t.key);
                setPinsOnly(false);
              }}
            />
          ))}
          <Chip
            label="PINs"
            color="amber"
            icon="pin"
            active={pinsOnly}
            onPress={() => {
              setType(null);
              setPinsOnly(!pinsOnly);
            }}
          />
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={i => String(i.id)}
        ListHeaderComponent={Header}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={s.sectionTitle}>{section.title.toUpperCase()}</Text>}
        ListEmptyComponent={
          <Text style={s.empty}>{browsing ? 'Nothing saved yet. Tap Add to save your first password, PIN or card.' : 'Nothing matches.'}</Text>
        }
        renderItem={({ item, index, section }) => (
          <Row
            item={item}
            first={index === 0}
            last={index === section.data.length - 1}
            onOpen={() => open(item.id)}
            onCopy={() => copy(item.id)}
          />
        )}
      />

      <ClipboardToast bottom={28} right={120} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add entry"
        onPress={() => navigation.navigate('Edit', { type: type ?? undefined, tab: pinsOnly ? 'pins' : undefined })}
        style={s.fab}>
        <Icon name="plus" size={22} color={colors.onPrimary} strokeWidth={2.6} />
        <Text style={s.fabText}>Add</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Strip({ tone, text, action, onPress }: { tone: 'ok' | 'warn' | 'danger'; text: string; action?: string; onPress?: () => void }) {
  const t =
    tone === 'ok'
      ? { bg: colors.successSoft, fg: colors.successInk, icon: colors.success }
      : tone === 'warn'
        ? { bg: colors.warnSoft, fg: colors.warnInk, icon: colors.warn }
        : { bg: colors.dangerSoft, fg: colors.danger, icon: colors.danger };
  const body = (
    <>
      {tone === 'ok' && <Icon name="check" size={18} color={t.icon} strokeWidth={2.4} />}
      <Text style={[s.stripText, { color: t.fg }]}>{text}</Text>
      {action && <Text style={s.stripAction}>{action}</Text>}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={[s.strip, { backgroundColor: t.bg }]}>
      {body}
    </Pressable>
  ) : (
    <View style={[s.strip, { backgroundColor: t.bg }]}>{body}</View>
  );
}

function Tiles({ label, items, onOpen, star }: { label: string; items: EntryListItem[]; onOpen: (id: number) => void; star?: boolean }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.sectionTitle}>{label}</Text>
      <View style={s.tiles}>
        {items.map(f => {
          const c = folderColor(typeInfo(f.type).color);
          return (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => onOpen(f.id)} style={[s.tile, { backgroundColor: c.soft }]}>
              <View style={s.tileTop}>
                <View style={s.tileInitial}>
                  <Text style={[s.tileInitialText, { color: c.ink }]}>{initial(f.title)}</Text>
                </View>
                {star && <Icon name="star" size={14} color={colors.warn} />}
              </View>
              <Text style={s.tileTitle} numberOfLines={1}>
                {f.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Row({
  item,
  first,
  last,
  onOpen,
  onCopy,
}: {
  item: EntryListItem;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onCopy: () => void;
}) {
  const t = typeInfo(item.type);
  const c = folderColor(t.color);
  const cards = Number(item.cards) || 0;
  const pins = Number(item.pins) || 0;
  const hasPassword = !!Number(item.has_password);
  const pinOnly = !hasPassword && pins > 0;
  const sub = [
    item.username,
    pins && !pinOnly ? plural(pins, 'PIN', 'PINs') : null,
    cards ? plural(cards, 'card', 'cards') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[s.row, first && s.rowFirst, last && s.rowLast, !last && s.rowDivider]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={s.rowMain}>
        <View style={[s.avatar, { backgroundColor: c.soft }]}>
          <Text style={[s.avatarText, { color: c.ink }]}>{initial(item.title)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.titleRow}>
            <Text style={[s.rowTitle, s.titleText]} numberOfLines={1}>
              {item.title}
            </Text>
            {pinOnly && (
              <View style={s.pinTag}>
                <Text style={s.pinTagText}>PIN</Text>
              </View>
            )}
          </View>
          {!!sub && (
            <Text style={s.rowUser} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
      </Pressable>
      {(hasPassword || pins > 0) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy ${hasPassword ? 'password' : 'PIN'} for ${item.title}`}
          onPress={onCopy}
          style={s.copyBtn}>
          <Icon name="copy" size={18} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function Chip({
  label,
  color,
  icon,
  active,
  onPress,
}: {
  label: string;
  color?: string;
  icon?: IconName;
  active: boolean;
  onPress: () => void;
}) {
  const c = folderColor(color);
  const bg = active ? (color ? c.solid : colors.primary) : color ? c.soft : colors.surface;
  const fg = active ? colors.onPrimary : color ? c.ink : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: bg }]}>
      {icon && <Icon name={icon} size={16} color={fg} />}
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const initial = (t: string) => (t.trim()[0] ?? '?').toUpperCase();

/** "today 9:00 pm", "yesterday 9:00 pm", or "3 Nov". */
function when(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (diff <= 0) {
    return `today ${time}`;
  }
  if (diff === 1) {
    return `yesterday ${time}`;
  }
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 24, paddingRight: 20, paddingTop: 14, paddingBottom: 12 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink },
  count: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted, marginTop: 2 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 16,
    height: 50,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  search: { flex: 1, height: 50, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  chips: { paddingHorizontal: 20, paddingBottom: 14, gap: 8 },
  chip: { height: 38, paddingHorizontal: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipText: { fontFamily: fonts.bold, fontSize: 14 },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, minHeight: 44 },
  stripText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  stripAction: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.primary },
  sectionTitle: { fontFamily: fonts.extrabold, fontSize: 12, letterSpacing: 0.8, color: colors.muted, marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, borderRadius: 18, padding: 12, gap: 8 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  tileInitial: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  tileInitialText: { fontFamily: fonts.extrabold, fontSize: 15 },
  tileTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 8 },
  rowFirst: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  rowLast: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titleText: { flexShrink: 1 },
  avatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.extrabold, fontSize: 16 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  rowUser: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted },
  pinTag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.warnSoft },
  pinTagText: { fontFamily: fonts.bold, fontSize: 11, color: colors.warnInk, letterSpacing: 0.5 },
  copyBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 16 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    height: 56,
    paddingLeft: 18,
    paddingRight: 22,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 6,
  },
  fabText: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.onPrimary },
});
