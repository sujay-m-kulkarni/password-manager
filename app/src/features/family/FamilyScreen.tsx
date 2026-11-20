/**
 * Family tab (1.11.0): the Family Kit's readiness checklist. Thirteen things a family needs if the
 * person who manages the money and papers dies suddenly; each is Done when an entry covers it,
 * Not needed when the person says so, or To do. Tapping one shows its entries and a way to add one.
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../../components/Icon';
import { kitProgress, kitRows, setNotNeeded, type KitRow } from '../../familyKit';
import type { RootStackParamList } from '../../navigation/types';
import { useDb, useSession } from '../../store/session';
import { colors, fonts } from '../../theme';

export function FamilyScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const db = useDb();
  const dataVersion = useSession(st => st.dataVersion);
  const touchData = useSession(st => st.touchData);
  const [open, setOpen] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const rows = useMemo(() => kitRows(db), [db, dataVersion, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const { done, total } = kitProgress(rows);
  const pct = total ? Math.round((done / total) * 100) : 100;

  const toggleNeeded = (r: KitRow) => {
    setNotNeeded(db, r.key, r.status !== 'na');
    setTick(t => t + 1);
    touchData();
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>Family Kit</Text>
        <Text style={s.lead}>
          What your family would need if something happened to you: what exists, the numbers that prove it, who the nominees are and
          where the papers are kept. Never amounts.
        </Text>

        <View style={s.progressCard}>
          <View style={s.progressHead}>
            <Text style={s.progressText}>
              {done} of {total} done
            </Text>
            <Text style={s.progressPct}>{pct}%</Text>
          </View>
          <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
            <View style={[s.fill, { width: `${pct}%` }]} />
          </View>
          <Text style={s.hint}>
            {done === total
              ? 'Everything is covered. Look it over once a year, and after a marriage, a birth or a new job.'
              : 'Tap an item to add what it needs, or mark it Not needed.'}
          </Text>
        </View>

        <View style={s.list}>
          {rows.map((r, i) => {
            const isOpen = open === r.key;
            return (
              <View key={r.key} style={[s.item, i === 0 && s.first, i === rows.length - 1 && s.last, i < rows.length - 1 && s.divider]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${r.title}: ${STATUS_LABEL[r.status]}`}
                  onPress={() => setOpen(isOpen ? null : r.key)}
                  style={s.itemHead}>
                  <View style={[s.icon, { backgroundColor: r.status === 'done' ? colors.successSoft : colors.raised }]}>
                    <Icon name={r.status === 'done' ? 'check' : r.icon} size={18} color={r.status === 'done' ? colors.success : colors.inkSoft} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.itemTitle, r.status === 'na' && s.muted]}>{r.title}</Text>
                    <Text style={s.itemSub} numberOfLines={isOpen ? undefined : 1}>
                      {r.status === 'done' ? r.entries.map(e => e.title).join(', ') : r.why}
                    </Text>
                  </View>
                  <View style={[s.status, STATUS_STYLE[r.status]]}>
                    <Text style={[s.statusText, { color: STATUS_INK[r.status] }]}>{STATUS_LABEL[r.status]}</Text>
                  </View>
                </Pressable>
                {isOpen && (
                  <View style={s.itemBody}>
                    {r.status === 'done' && <Text style={s.hint}>{r.why}</Text>}
                    {r.entries.map(e => (
                      <Pressable
                        key={e.id}
                        accessibilityRole="button"
                        onPress={() => navigation.navigate('Entry', { id: e.id })}
                        style={s.entryRow}>
                        <Text style={s.entryTitle} numberOfLines={1}>
                          {e.title}
                        </Text>
                        <Icon name="chevron-right" size={18} color={colors.muted} />
                      </Pressable>
                    ))}
                    <View style={s.actions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => navigation.navigate('Edit', { type: r.addType, tab: r.addTab })}
                        style={s.addBtn}>
                        <Icon name="plus" size={18} color={colors.onPrimary} strokeWidth={2.6} />
                        <Text style={s.addText}>{r.entries.length ? 'Add another' : 'Add'}</Text>
                      </Pressable>
                      {r.status !== 'done' && (
                        <Pressable accessibilityRole="button" onPress={() => toggleNeeded(r)} style={s.naBtn}>
                          <Text style={s.naText}>{r.status === 'na' ? 'Needed after all' : 'Not needed'}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={s.next}>
          <Text style={s.nextTitle}>Coming next: getting your family in</Text>
          <Text style={s.hint}>
            A family copy that opens with three questions your family knows plus a code you choose, and a sheet to seal with your will.
            Until then, your daily backup holds all of this.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const STATUS_LABEL = { done: 'Done', na: 'Not needed', todo: 'To do' } as const;
const STATUS_STYLE = {
  done: { backgroundColor: colors.successSoft },
  na: { backgroundColor: colors.raised },
  todo: { backgroundColor: colors.warnSoft },
} as const;
const STATUS_INK = { done: colors.success, na: colors.muted, todo: colors.warnInk } as const;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, paddingHorizontal: 4 },
  lead: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft, paddingHorizontal: 4 },
  progressCard: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, gap: 10 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressText: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  progressPct: { fontFamily: fonts.bold, fontSize: 14, color: colors.primary },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.raised, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  list: {},
  item: { backgroundColor: colors.surface },
  first: { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  last: { borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  itemSub: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, marginTop: 1 },
  muted: { color: colors.muted },
  status: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9 },
  statusText: { fontFamily: fonts.extrabold, fontSize: 11 },
  itemBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  entryTitle: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  addText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.onPrimary },
  naBtn: { height: 44, paddingHorizontal: 14, borderRadius: 14, justifyContent: 'center', backgroundColor: colors.raised },
  naText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  next: { backgroundColor: colors.deep, borderRadius: 18, padding: 16, gap: 6 },
  nextTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
});
