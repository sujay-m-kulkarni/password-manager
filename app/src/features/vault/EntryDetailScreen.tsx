/**
 * An entry's page. Read-only first: values with Copy / Show. Tapping Edit turns the same screen
 * into the form (text boxes) with Save / Cancel; saving returns to the read-only view.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ClipboardToast } from '../../components/ClipboardToast';
import { Icon, type IconName } from '../../components/Icon';
import { Button, StrengthBar } from '../../components/ui';
import { cardNetwork, groupCardNumber, maskCardNumber, type Card } from '../../cards';
import { deleteEntry, getEntry, groupPin, listCards, listPins, setFavorite, type EntryPin } from '../../db/database';
import { parseCustomFields, type CustomField } from '../../customFields';
import { typeInfo } from '../../entryTypes';
import type { RootStackParamList } from '../../navigation/types';
import { copyWithAutoClear } from '../../security/clipboard';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';
import { EntryForm } from './EntryForm';

type Props = NativeStackScreenProps<RootStackParamList, 'Entry'>;

export function EntryDetailScreen({ navigation, route }: Props) {
  const db = useDb();
  const dataVersion = useSession(st => st.dataVersion);
  const touchData = useSession(st => st.touchData);
  const clipboardSec = useSession(st => st.settings.clipboardSec);
  const [shown, setShown] = useState(false);
  const [editing, setEditing] = useState(false);
  const stopEditing = useCallback(() => setEditing(false), []);

  const entry = useMemo(() => getEntry(db, route.params.id), [db, route.params.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useMemo(() => listCards(db, route.params.id), [db, route.params.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const pins = useMemo(() => listPins(db, route.params.id), [db, route.params.id, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!entry) {
    return null;
  }

  if (editing) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <EntryForm
          existing={entry}
          existingCards={cards}
          existingPins={pins}
          onCancel={stopEditing}
          onSaved={() => {
            touchData();
            setShown(false);
            setEditing(false);
          }}
        />
      </SafeAreaView>
    );
  }

  const t = typeInfo(entry.type);
  const c = folderColor(t.color);
  const hasPassword = entry.password.length > 0;
  const strength = estimateStrength(entry.password);
  const fields = parseCustomFields(entry.fields);
  const copy = (text: string) => copyWithAutoClear(text, clipboardSec);

  const onDelete = () =>
    Alert.alert(
      'Delete this entry?',
      `"${entry.title}"${
        pins.length || cards.length ? ' with its PINs and cards' : ''
      } will be permanently removed from the vault.`,
      [
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
      ],
    );

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
              <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={s.editBtn}>
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
              <View style={s.pills}>
                <View style={s.pill}>
                  <Text style={[s.pillText, { color: c.ink }]}>{t.label}</Text>
                </View>
                {pins.length > 0 && (
                  <View style={s.pill}>
                    <Text style={[s.pillText, { color: colors.warnInk }]}>{pins.length === 1 ? '1 PIN' : `${pins.length} PINs`}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </SafeAreaView>

        <View style={s.body}>
          {!!entry.username && (
            <Row label="Username" value={entry.username}>
              <SmallBtn label="Copy username" text="Copy" onPress={() => copy(entry.username!)} />
            </Row>
          )}
          {hasPassword && (
            <>
              <Row label="Password" value={shown ? entry.password : '•'.repeat(12)} mono>
                <SmallBtn
                  label={shown ? 'Hide password' : 'Show password'}
                  text={shown ? 'Hide' : 'Show'}
                  onPress={() => setShown(v => !v)}
                  muted
                />
                <SmallBtn label="Copy password" text="Copy" onPress={() => copy(entry.password)} />
              </Row>
              <View style={{ paddingHorizontal: 6 }}>
                <StrengthBar score={strength.score} label={strength.label} />
              </View>
            </>
          )}
          {!!entry.url && <Row label="Website" value={entry.url} />}
          {fields.map((f, i) => (
            <FieldView key={`${f.name}-${i}`} field={f} onCopy={copy} />
          ))}

          {pins.length > 0 && (
            <>
              <Text style={s.section}>PINs</Text>
              {pins.map(p => (
                <PinRow key={p.id} pin={p} onCopy={copy} />
              ))}
            </>
          )}

          {t.cards && cards.length > 0 && (
            <>
              <Text style={s.section}>Cards</Text>
              {cards.map(card => (
                <CardView key={card.id} card={card} onCopy={copy} />
              ))}
            </>
          )}

          {!!entry.notes && <Row label="Notes" value={entry.notes} />}
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

/** One custom field: Copy; a Hidden one shows dots until Show. */
function FieldView({ field, onCopy }: { field: CustomField; onCopy: (text: string) => void }) {
  const [shown, setShown] = useState(false);
  const hidden = field.kind === 'hidden';
  return (
    <Row label={field.name} value={hidden && !shown ? '•'.repeat(Math.min(field.value.length, 12)) : field.value} mono={field.kind !== 'text'}>
      {hidden && (
        <SmallBtn label={shown ? `Hide ${field.name}` : `Show ${field.name}`} text={shown ? 'Hide' : 'Show'} onPress={() => setShown(v => !v)} muted />
      )}
      <SmallBtn label={`Copy ${field.name}`} text="Copy" onPress={() => onCopy(field.value)} />
    </Row>
  );
}

/** One named PIN, hidden until Show. */
function PinRow({ pin, onCopy }: { pin: EntryPin; onCopy: (text: string) => void }) {
  const [shown, setShown] = useState(false);
  return (
    <Row label={pin.label} value={shown ? groupPin(pin.value) : '•'.repeat(pin.value.length)} big>
      <SmallBtn label={shown ? `Hide ${pin.label}` : `Show ${pin.label}`} text={shown ? 'Hide' : 'Show'} onPress={() => setShown(v => !v)} muted />
      <SmallBtn label={`Copy ${pin.label}`} text="Copy" onPress={() => onCopy(pin.value)} />
    </Row>
  );
}

/** One card, read-only: number and PIN hidden until Show; each value can be copied. */
function CardView({ card, onCopy }: { card: Card; onCopy: (text: string) => void }) {
  const [shown, setShown] = useState(false);
  const network = cardNetwork(card.number);
  const kind = card.kind === 'credit' ? 'Credit card' : 'Debit card';
  return (
    <View style={s.cardBox}>
      <View style={s.cardHead}>
        <Text style={s.cardTitle}>{[card.bank, kind, network].filter(Boolean).join(' · ')}</Text>
        <SmallBtn
          label={shown ? `Hide ${kind} details` : `Show ${kind} details`}
          text={shown ? 'Hide' : 'Show'}
          onPress={() => setShown(v => !v)}
          muted
        />
      </View>
      <Row label="Number" value={shown ? groupCardNumber(card.number) : maskCardNumber(card.number)} mono inset>
        <SmallBtn label={`Copy ${kind} number`} text="Copy" onPress={() => onCopy(card.number)} />
      </Row>
      <View style={s.cardGrid}>
        {!!card.expiry && (
          <View style={{ flex: 1 }}>
            <Row label="Expiry" value={card.expiry} mono inset />
          </View>
        )}
        {!!card.pin && (
          <View style={{ flex: 1 }}>
            <Row label="Card PIN" value={shown ? card.pin : '•'.repeat(card.pin.length)} mono inset>
              <SmallBtn label={`Copy ${kind} PIN`} text="Copy" onPress={() => onCopy(card.pin)} />
            </Row>
          </View>
        )}
      </View>
      {!!card.name && <Row label="Name on card" value={card.name} inset />}
    </View>
  );
}

function Row({
  label,
  value,
  mono,
  big,
  inset,
  children,
}: {
  label: string;
  value: string;
  mono?: boolean;
  big?: boolean;
  inset?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[s.row, inset && s.rowInset]}>
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel}>{label.toUpperCase()}</Text>
        <Text style={[s.rowValue, mono && s.mono, big && s.bigValue]} selectable={false}>
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

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 12, paddingBottom: 28 },
  heroBar: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 },
  heroBtn: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroBtnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  editBtn: { height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colors.surface, justifyContent: 'center' },
  editText: { fontFamily: fonts.bold, fontSize: 15 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingTop: 16 },
  bigInitial: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  bigInitialText: { fontFamily: fonts.extrabold, fontSize: 26 },
  heroTitle: { fontFamily: fonts.extrabold, fontSize: 24, color: colors.ink },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: colors.surface },
  pillText: { fontFamily: fonts.bold, fontSize: 12 },
  body: { padding: 16, gap: 10 },
  section: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, marginTop: 8, paddingHorizontal: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 6,
  },
  rowInset: { backgroundColor: colors.raised, borderRadius: 14 },
  rowLabel: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  rowValue: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink, marginTop: 2 },
  mono: { fontFamily: 'monospace', letterSpacing: 1 },
  bigValue: { fontFamily: 'monospace', fontSize: 26, letterSpacing: 4, marginTop: 4 },
  cardBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  cardGrid: { flexDirection: 'row', gap: 8 },
  smallBtn: { minWidth: 56, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallBtnText: { fontFamily: fonts.bold, fontSize: 14 },
  meta: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, paddingHorizontal: 6, marginVertical: 6 },
});
