/**
 * The entry form: used for a new entry (Edit route) and, in place, when Edit is tapped on an
 * entry's page. Login or PIN; a type (Banking, Investments, …) with its own fields; and for
 * Banking, the account's debit and credit cards.
 */
import React, { useEffect, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Field, StrengthBar, secretInputProps } from '../../components/ui';
import {
  cardNetwork,
  cardProblem,
  cleanCardNumber,
  digits,
  emptyCard,
  formatExpiry,
  groupCardNumber,
  luhnOk,
  type Card,
  type CardKind,
} from '../../cards';
import {
  PIN_MIN,
  cleanPin,
  isValidPin,
  pinFormatOf,
  pinMax,
  saveEntry,
  type Entry,
  type EntryKind,
  type PinFormat,
} from '../../db/database';
import { ENTRY_TYPES, parseFields, typeInfo, type EntryType, type TypeFields } from '../../entryTypes';
import { useDb } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';
import { GeneratorPanel } from '../generator/GeneratorPanel';

type Props = {
  existing: Entry | null;
  existingCards?: Card[];
  initialKind?: EntryKind;
  initialType?: EntryType;
  onSaved: (id: number) => void;
  onCancel: () => void;
};

export function EntryForm({ existing, existingCards = [], initialKind, initialType, onSaved, onCancel }: Props) {
  const db = useDb();
  const [kind, setKind] = useState<EntryKind>(existing?.kind ?? initialKind ?? 'login');
  const pin = kind === 'pin';
  const [type, setType] = useState<EntryType>(existing?.type ?? initialType ?? 'other');
  const [fields, setFields] = useState<TypeFields>(() => (existing ? parseFields(existing.type, existing.fields) : {}));
  const [cards, setCards] = useState<Card[]>(existingCards);
  const [pinFormat, setPinFormat] = useState<PinFormat>(
    existing?.kind === 'pin' ? pinFormatOf(existing.password) : 'numeric',
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState(existing?.password ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [favorite, setFav] = useState(!!existing?.favorite);
  const [showPw, setShowPw] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android back: closes the generator sheet first, then cancels the edit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (genOpen) {
        setGenOpen(false);
      } else {
        onCancel();
      }
      return true;
    });
    return () => sub.remove();
  }, [genOpen, onCancel]);

  const info = typeInfo(type);
  const showCards = info.cards && !pin;
  const cardsOk = !showCards || cards.every(c => cardProblem(c) == null);
  const pinInvalid = pin && password.length > 0 && !isValidPin(password, pinFormat);
  const canSave = title.trim().length > 0 && password.length > 0 && (!pin || isValidPin(password, pinFormat)) && cardsOk;
  const strength = estimateStrength(password);

  const switchPinFormat = (next: PinFormat) => {
    setPinFormat(next);
    setPassword(p => cleanPin(p, next)); // letters are dropped when going to numbers only
    setError(null);
  };

  const switchKind = (next: EntryKind) => {
    if (next === kind) {
      return;
    }
    setKind(next);
    // Keep the secret if it still fits; switching back to the saved type restores what was saved.
    if (existing && next === existing.kind) {
      setPassword(existing.password);
      if (next === 'pin') {
        setPinFormat(pinFormatOf(existing.password));
      }
    } else if (next === 'pin') {
      if (isValidPin(password)) {
        setPinFormat(pinFormatOf(password));
      } else {
        setPassword('');
      }
    }
    setShowPw(false);
    setError(null);
  };

  const onSave = () => {
    try {
      const id = saveEntry(
        db,
        {
          kind,
          type,
          fields,
          cards: showCards ? cards : [],
          folder_id: existing?.folder_id ?? null,
          title,
          username,
          password,
          url,
          notes,
          favorite,
        },
        existing?.id,
      );
      onSaved(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  const what = pin ? 'PIN' : info.key === 'other' ? 'password' : info.label.toLowerCase();

  return (
    <View style={{ flex: 1 }}>
      <View style={s.bar}>
        <Button title="Cancel" variant="ghost" small onPress={onCancel} />
        <Text style={s.barTitle} numberOfLines={1}>
          {existing ? 'Edit' : 'New'} {what}
        </Text>
        <Button title="Save" small onPress={onSave} disabled={!canSave} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Type</Text>
            <View style={s.chips} accessibilityRole="radiogroup">
              {ENTRY_TYPES.map(t => (
                <TypeChip key={t.key} label={t.label} color={t.color} active={type === t.key} onPress={() => setType(t.key)} />
              ))}
            </View>
          </View>

          {/* Shown when adding and when editing, so a saved entry can change between Login and PIN. */}
          <View style={s.kindRow} accessibilityRole="radiogroup">
            <KindButton label="Login" hint="Username and password" active={!pin} onPress={() => switchKind('login')} />
            <KindButton label="PIN" hint="Phone, SIM, ATM, UPI" active={pin} onPress={() => switchKind('pin')} />
          </View>

          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder={pin ? 'e.g. Phone lock, HDFC ATM, UPI' : placeholderFor(type)}
            autoFocus={!existing}
          />

          {pin ? (
            <View style={{ gap: 8 }}>
              <View style={s.chips} accessibilityRole="radiogroup">
                <FormatChip label="Numbers" active={pinFormat === 'numeric'} onPress={() => switchPinFormat('numeric')} />
                <FormatChip
                  label="Letters & numbers"
                  active={pinFormat === 'alphanumeric'}
                  onPress={() => switchPinFormat('alphanumeric')}
                />
              </View>
              <Field
                // a new key swaps the keyboard (number pad ↔ letters) at once
                key={pinFormat}
                label="PIN"
                value={password}
                onChangeText={t => setPassword(cleanPin(t, pinFormat))}
                {...secretInputProps}
                secureTextEntry={!showPw}
                keyboardType={pinFormat === 'numeric' ? 'number-pad' : 'default'}
                maxLength={pinMax(pinFormat)}
              />
              <View style={s.pwTools}>
                <Text style={[s.hint, pinInvalid && s.hintBad]}>
                  {PIN_MIN}–{pinMax(pinFormat)} {pinFormat === 'numeric' ? 'digits' : 'letters or digits'}
                  {password.length > 0 ? ` · ${password.length} entered` : ''}
                </Text>
                <Button title={showPw ? 'Hide' : 'Show'} variant="soft" small onPress={() => setShowPw(v => !v)} />
              </View>
            </View>
          ) : (
            <>
              <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" importantForAutofill="no" />
              <View style={{ gap: 8 }}>
                <Field label="Password" value={password} onChangeText={setPassword} {...secretInputProps} secureTextEntry={!showPw} />
                <View style={s.pwTools}>
                  <View style={{ flex: 1 }}>
                    {password.length > 0 && <StrengthBar score={strength.score} label={strength.label} />}
                  </View>
                  <Button title={showPw ? 'Hide' : 'Show'} variant="soft" small onPress={() => setShowPw(v => !v)} />
                  <Button title="Generate" small onPress={() => setGenOpen(true)} />
                </View>
              </View>
              <Field
                label="Website"
                value={url}
                onChangeText={setUrl}
                autoCapitalize="none"
                keyboardType="url"
                importantForAutofill="no"
              />
              {info.fields.map(f => (
                <Field
                  key={`${type}-${f.key}`}
                  label={f.label}
                  value={fields[f.key] ?? ''}
                  onChangeText={t => setFields(prev => ({ ...prev, [f.key]: f.upper ? t.toUpperCase() : t }))}
                  placeholder={f.placeholder}
                  keyboardType={f.keyboard ?? 'default'}
                  autoCapitalize={f.upper ? 'characters' : 'none'}
                  maxLength={f.maxLength}
                  importantForAutofill="no"
                  autoCorrect={false}
                />
              ))}
            </>
          )}

          {showCards && <CardsEditor cards={cards} onChange={setCards} />}

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: favorite }}
            onPress={() => setFav(v => !v)}
            style={s.favRow}>
            <Text style={s.favText}>Add to favorites</Text>
            <View style={[s.switch, favorite && s.switchOn]}>
              <View style={[s.knob, favorite && s.knobOn]} />
            </View>
          </Pressable>

          <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
          {error && <Banner text={error} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* In-screen overlay, not <Modal>: a Modal is a separate window without FLAG_SECURE. */}
      {genOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={s.scrim} accessibilityLabel="Close generator" onPress={() => setGenOpen(false)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Generate password</Text>
            <GeneratorPanel
              primaryAction={{
                title: 'Use this password',
                onPress: generated => {
                  setPassword(generated);
                  setGenOpen(false);
                },
              }}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const placeholderFor = (t: EntryType) =>
  t === 'banking'
    ? 'e.g. HDFC Bank'
    : t === 'investments'
      ? 'e.g. Zerodha, Groww'
      : t === 'social'
        ? 'e.g. Instagram'
        : t === 'email'
          ? 'e.g. Gmail'
          : 'e.g. Wi-Fi, Netflix';

function CardsEditor({ cards, onChange }: { cards: Card[]; onChange: React.Dispatch<React.SetStateAction<Card[]>> }) {
  // Functional updates: several quick changes in a row must not overwrite each other.
  const update = (i: number, patch: Partial<Card>) => onChange(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const add = (kind: CardKind) => onChange(prev => [...prev, emptyCard(kind)]);
  return (
    <View style={{ gap: 10 }}>
      <Text style={s.label}>Cards on this account</Text>
      {cards.map((c, i) => (
        <CardEditor
          key={c.id ?? `new-${i}`}
          card={c}
          index={i}
          onChange={patch => update(i, patch)}
          onRemove={() => onChange(prev => prev.filter((_, j) => j !== i))}
        />
      ))}
      <View style={s.chips}>
        <Button title="+ Debit card" small variant="soft" onPress={() => add('debit')} />
        <Button title="+ Credit card" small variant="soft" onPress={() => add('credit')} />
      </View>
      <Text style={s.hint}>The CVV is never stored. Keep it on the card itself.</Text>
    </View>
  );
}

function CardEditor({
  card,
  index,
  onChange,
  onRemove,
}: {
  card: Card;
  index: number;
  onChange: (patch: Partial<Card>) => void;
  onRemove: () => void;
}) {
  const [showPin, setShowPin] = useState(false);
  const n = digits(card.number);
  const network = cardNetwork(n);
  const problem = n.length > 0 ? cardProblem(card) : null;
  const luhnWarn = n.length >= 12 && !problem && !luhnOk(n);
  return (
    <View style={s.cardBox} accessibilityLabel={`Card ${index + 1}`}>
      <View style={s.cardTop}>
        <View style={s.chips} accessibilityRole="radiogroup">
          <FormatChip label="Debit" active={card.kind === 'debit'} onPress={() => onChange({ kind: 'debit' })} />
          <FormatChip label="Credit" active={card.kind === 'credit'} onPress={() => onChange({ kind: 'credit' })} />
        </View>
        <Button title="Remove" small variant="ghost" onPress={onRemove} />
      </View>
      <Field
        label={network ? `Card number · ${network}` : 'Card number'}
        value={groupCardNumber(card.number)}
        onChangeText={t => onChange({ number: cleanCardNumber(t) })}
        keyboardType="number-pad"
        maxLength={23}
        {...secretInputProps}
      />
      <View style={s.cardRow}>
        <View style={{ flex: 1 }}>
          <Field
            label="Expiry (MM/YY)"
            value={card.expiry}
            onChangeText={t => onChange({ expiry: formatExpiry(t, card.expiry) })}
            // formatExpiry compares with the previous value to tell typing from deleting
            keyboardType="number-pad"
            maxLength={5}
            placeholder="08/29"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Card PIN"
            value={card.pin}
            onChangeText={t => onChange({ pin: digits(t).slice(0, 6) })}
            keyboardType="number-pad"
            maxLength={6}
            {...secretInputProps}
            secureTextEntry={!showPin}
          />
        </View>
      </View>
      <Field
        label="Name on card"
        value={card.name}
        onChangeText={t => onChange({ name: t.toUpperCase() })}
        autoCapitalize="characters"
        importantForAutofill="no"
        autoCorrect={false}
      />
      <View style={s.pwTools}>
        <Text style={[s.hint, (problem || luhnWarn) && s.hintBad]}>
          {problem ?? (luhnWarn ? 'This number doesn’t look right. Check for a typo.' : ' ')}
        </Text>
        {card.pin.length > 0 && (
          <Button title={showPin ? 'Hide PIN' : 'Show PIN'} variant="soft" small onPress={() => setShowPin(v => !v)} />
        )}
      </View>
    </View>
  );
}

function KindButton({ label, hint, active, onPress }: { label: string; hint: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.kindBtn, active && s.kindBtnOn]}>
      <Text style={[s.kindLabel, active && s.kindLabelOn]}>{label}</Text>
      <Text style={[s.kindHint, active && s.kindHintOn]}>{hint}</Text>
    </Pressable>
  );
}

function FormatChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.formatChip, active && s.formatChipOn]}>
      <Text style={[s.formatText, active && s.formatTextOn]}>{label}</Text>
    </Pressable>
  );
}

function TypeChip({ label, color, active, onPress }: { label: string; color: string; active: boolean; onPress: () => void }) {
  const c = folderColor(color);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: active ? c.solid : c.soft }]}>
      <Text style={[s.chipText, { color: active ? colors.onPrimary : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  barTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  form: { padding: 16, gap: 16, paddingBottom: 40 },
  pwTools: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  hint: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  hintBad: { color: colors.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bold, fontSize: 14 },
  cardBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', gap: 10 },
  favRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  favText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.raised, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.onPrimary },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 12 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  sheetTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindBtn: {
    flex: 1,
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  kindBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindLabel: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  kindLabelOn: { color: colors.onPrimary },
  kindHint: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  kindHintOn: { color: colors.onPrimary },
  formatChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  formatChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  formatText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  formatTextOn: { color: colors.onPrimary },
});
