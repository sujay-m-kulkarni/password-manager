import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardToast } from '../../components/ClipboardToast';
import { Button, StrengthBar } from '../../components/ui';
import { deleteEntry, getEntry, listFolders, setFavorite, groupPin } from '../../db/database';
import { copyWithAutoClear } from '../../security/clipboard';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';
import type { RootStackParamList } from '../../navigation/types';
import { Icon, type IconName } from '../../components/Icon';

type Props = NativeStackScreenProps<RootStackParamList, 'Entry'>;

export function EntryDetailScreen({ navigation, route }: Props) {
  const db = useDb();
  const dataVersion = useSession(st => st.dataVersion);
  const touchData = useSession(st => st.touchData);
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  const [shown, setShown] = useState(false);

  const entry = useMemo(() => getEntry(db, route.params.id), [db, route.params.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const folder = useMemo(
    () => listFolders(db).find(f => f.id === entry?.folder_id) ?? null,
    [db, entry?.folder_id],
  );

  if (!entry) {
    return null;
  }
  const c = folderColor(folder?.color);
  const isPin = entry.kind === 'pin';
  const strength = estimateStrength(entry.password);

  const copy = (text: string) => copyWithAutoClear(text, clipboardSec);

  const onDelete = () =>
    Alert.alert('Delete this entry?', `"${entry.title}" will be permanently removed from the vault.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteEntry(db, entry.id);
          touchData();
          navigation.goBack();
        },
      },
    ]);

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <SafeAreaView edges={['top']} style={[s.hero, { backgroundColor: c.soft }]}>
          <View style={s.heroBar}>
            <HeroButton label="Back" icon="chevron-left" text="Back" onPress={() => navigation.goBack()} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <HeroButton
                label={entry.favorite ? 'Remove from favorites' : 'Add to favorites'}
                icon={entry.favorite ? 'star' : 'star-outline'}
                onPress={() => {
                  setFavorite(db, entry.id, !entry.favorite);
                  touchData();
                }}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Edit', { id: entry.id })}
                style={s.editBtn}>
                <Text style={[s.editText, { color: c.ink }]}>Edit</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.heroBody}>
            <View style={s.bigInitial}>
              <Text style={[s.bigInitialText, { color: c.ink }]}>{(entry.title[0] ?? '?').toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={s.heroTitle} numberOfLines={2}>
                {entry.title}
              </Text>
              {folder && (
                <View style={s.folderPill}>
                  <Text style={s.folderPillText}>{folder.name}</Text>
                </View>
              )}
            </View>
          </View>
        </SafeAreaView>

        <View style={s.body}>
          {!!entry.username && (
            <Card label="Username" value={entry.username}>
              <SmallBtn label="Copy username" text="Copy" onPress={() => copy(entry.username!)} />
            </Card>
          )}
          {isPin ? (
            <Card label="PIN" value={shown ? groupPin(entry.password) : '•'.repeat(entry.password.length)} pin>
              <SmallBtn label={shown ? 'Hide PIN' : 'Show PIN'} text={shown ? 'Hide' : 'Show'} onPress={() => setShown(v => !v)} muted />
              <SmallBtn label="Copy PIN" text="Copy" onPress={() => copy(entry.password)} />
            </Card>
          ) : (
            <>
              <Card label="Password" value={shown ? entry.password : '•'.repeat(12)} mono>
                <SmallBtn label={shown ? 'Hide password' : 'Show password'} text={shown ? 'Hide' : 'Show'} onPress={() => setShown(v => !v)} muted />
                <SmallBtn label="Copy password" text="Copy" onPress={() => copy(entry.password)} />
              </Card>
              <View style={{ paddingHorizontal: 6 }}>
                <StrengthBar score={strength.score} label={strength.label} />
              </View>
            </>
          )}
          {!!entry.url && <Card label="Website" value={entry.url} />}
          {!!entry.notes && <Card label="Notes" value={entry.notes} />}
          <Text style={s.meta}>
            Created {fmtDate(entry.created_at)} · Edited {fmtDate(entry.updated_at)}
          </Text>
          <Button title="Delete entry" variant="danger" onPress={onDelete} />
        </View>
      </ScrollView>
      <ClipboardToast bottom={24} />
    </SafeAreaView>
  );
}

function Card({ label, value, mono, pin, children }: { label: string; value: string; mono?: boolean; pin?: boolean; children?: React.ReactNode }) {
  return (
    <View style={s.card}>
      <View style={{ flex: 1 }}>
        <Text style={s.cardLabel}>{label.toUpperCase()}</Text>
        <Text style={[s.cardValue, mono && s.mono, pin && s.pinValue]} selectable={false}>
          {value}
        </Text>
      </View>
      {children}
    </View>
  );
}

function SmallBtn({ label, text, onPress, muted }: { label: string; text: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.smallBtn, { backgroundColor: muted ? colors.raised : colors.primarySoft }]}>
      <Text style={[s.smallBtnText, { color: muted ? colors.inkSoft : colors.primary }]}>{text}</Text>
    </Pressable>
  );
}

function HeroButton({ label, text, icon, onPress }: { label: string; text?: string; icon?: IconName; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.heroBtn, s.heroBtnRow]}>
      {icon && <Icon name={icon} size={18} color={colors.ink} strokeWidth={2.5} />}
      {text && <Text style={s.heroBtnText}>{text}</Text>}
    </Pressable>
  );
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 12, paddingBottom: 28 },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  heroBtn: { minWidth: 44, height: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  heroBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  editBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center' },
  editText: { fontFamily: fonts.bold, fontSize: 15 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingTop: 16 },
  bigInitial: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bigInitialText: { fontFamily: fonts.extrabold, fontSize: 26 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  folderPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.18)' },
  folderPillText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  body: { padding: 16, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 12, paddingLeft: 16, paddingRight: 6 },
  cardLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  cardValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 2 },
  mono: { fontFamily: 'monospace', letterSpacing: 1 },
  pinValue: { fontFamily: 'monospace', fontSize: 26, letterSpacing: 4, marginTop: 4 },
  smallBtn: { minWidth: 56, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallBtnText: { fontFamily: fonts.bold, fontSize: 14 },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, paddingHorizontal: 6, marginVertical: 6 },
});
