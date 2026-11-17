/**
 * The entry form: used for a new entry (Edit route) and, in place, when Edit is tapped on an
 * entry's page. One entry holds any of: a login (with the type's own fields), named PINs, and —
 * for Banking — the account's debit and credit cards. Tabs show one part at a time (design H4).
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
  PIN_LABELS,
  PIN_MIN,
  cleanPin,
  isValidPin,
  pinFormatOf,
  pinMax,
  pinProblem,
  saveEntry,
  type Entry,
  type EntryPin,
  type PinFormat,
} from '../../db/database';
import { ENTRY_TYPES, parseFields, typeInfo, type EntryType, type TypeFields } from '../../entryTypes';
import { useDb } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';
import { GeneratorPanel } from '../generator/GeneratorPanel';

export type FormTab = 'login' | 'pins' | 'cards';

type Props = {
  existing: Entry | null;
  existingCards?: Card[];
  existingPins?: EntryPin[];
  /** 'pins' opens a new entry on the PINs tab with one empty PIN (from the PINs filter). */
  initialTab?: FormTab;
  initialType?: EntryType;
  onSaved: (id: number) => void;
  onCancel: () => void;
};

export function EntryForm({
  existing,
  existingCards = [],
  existingPins = [],
  initialTab,
  initialType,
  onSaved,
  onCancel,
}: Props) {
  const db = useDb();
  const [type, setType] = useState<EntryType>(existing?.type ?? initialType ?? 'other');
  const [fields, setFields] = useState<TypeFields>(() => (existing ? parseFields(existing.type, existing.fields) : {}));
  const [cards, setCards] = useState<Card[]>(existingCards);
  const [pins, setPins] = useState<EntryPin[]>(() =>
    existingPins.length || initialTab !== 'pins' ? existingPins : [{ label: '', value: '' }],
  );
  const [tab, setTab] = useState<FormTab>(() =>
    initialTab ?? (existing && !existing.password ? (existingPins.length ? 'pins' : existingCards.length ? 'cards' : 'login') : 'login'),
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
  const showCards = info.cards;
  const usedPins = pins.filter(p => p.value.length > 0 || p.label.trim().length > 0);
  const cardsOk = !showCards || cards.every(c => cardProblem(c) == null);
  const pinsOk = usedPins.every(p => pinProblem(p) == null);
  const hasSecret = password.length > 0 || usedPins.length > 0 || (showCards && cards.length > 0);
  const canSave = title.trim().length > 0 && hasSecret && cardsOk && pinsOk;
  const strength = estimateStrength(password);
  const currentTab: FormTab = tab === 'cards' && !showCards ? 'login' : tab;

  const onSave = () => {
    try {
      const id = saveEntry(
        db,
        {
          type,
          fields,
          pins: usedPins,
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

  const what = info.key === 'other' ? 'entry' : info.label.toLowerCase();
  const tabs: { key: FormTab; label: string }[] = [
    { key: 'login', label: password ? 'Login ✓' : 'Login' },
    { key: 'pins', label: usedPins.length ? `PINs · ${usedPins.length}` : 'PINs' },
    ...(showCards ? [{ key: 'cards' as const, label: cards.length ? `Cards · ${cards.length}` : 'Cards' }] : []),
  ];

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

          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder={placeholderFor(type)}
            autoFocus={!existing}
          />

          <View style={s.tabs} accessibilityRole="tablist">
            {tabs.map(t => (
              <Pressable
                key={t.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: currentTab === t.key }}
                onPress={() => setTab(t.key)}
                style={[s.tab, currentTab === t.key && s.tabOn]}>
                <Text style={[s.tabText, currentTab === t.key && s.tabTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {currentTab === 'login' && (
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

          {currentTab === 'pins' && <PinsEditor pins={pins} onChange={setPins} />}

          {currentTab === 'cards' && <CardsEditor cards={cards} onChange={setCards} />}

          {!hasSecret && title.trim().length > 0 && (
            <Text style={s.hint}>Add a password, a PIN{showCards ? ' or a card' : ''} to save this entry.</Text>
          )}

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

function PinsEditor({ pins, onChange }: { pins: EntryPin[]; onChange: React.Dispatch<React.SetStateAction<EntryPin[]>> }) {
  const update = (i: number, patch: Partial<EntryPin>) => onChange(prev => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <View style={{ gap: 10 }}>
      {pins.map((p, i) => (
        <PinEditor
          key={p.id ?? `new-${i}`}
          pin={p}
          onChange={patch => update(i, patch)}
          onRemove={() => onChange(prev => prev.filter((_, j) => j !== i))}
        />
      ))}
      <Button title="+ Add PIN" variant="soft" onPress={() => onChange(prev => [...prev, { label: '', value: '' }])} />
      <Text style={s.hint}>For example the UPI PIN, ATM PIN or MPIN of this account, or a phone lock.</Text>
    </View>
  );
}

function PinEditor({ pin, onChange, onRemove }: { pin: EntryPin; onChange: (p: Partial<EntryPin>) => void; onRemove: () => void }) {
  const [format, setFormat] = useState<PinFormat>(pinFormatOf(pin.value));
  const [show, setShow] = useState(false);
  const bad = pin.value.length > 0 && !isValidPin(pin.value, format);
  const switchFormat = (next: PinFormat) => {
    setFormat(next);
    onChange({ value: cleanPin(pin.value, next) }); // letters are dropped when going to numbers only
  };
  return (
    <View style={s.cardBox}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Field
            label="PIN name"
            value={pin.label}
            onChangeText={t => onChange({ label: t })}
            placeholder="e.g. UPI PIN"
            maxLength={30}
            importantForAutofill="no"
          />
        </View>
        <Button title="Remove" small variant="ghost" onPress={onRemove} />
      </View>
      {!pin.label.trim() && (
        <View style={s.chips}>
          {PIN_LABELS.map(l => (
            <Pressable key={l} accessibilityRole="button" onPress={() => onChange({ label: l })} style={s.suggest}>
              <Text style={s.suggestText}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={s.chips} accessibilityRole="radiogroup">
        <FormatChip label="Numbers" active={format === 'numeric'} onPress={() => switchFormat('numeric')} />
        <FormatChip label="Letters & numbers" active={format === 'alphanumeric'} onPress={() => switchFormat('alphanumeric')} />
      </View>
      <Field
        // a new key swaps the keyboard (number pad ↔ letters) at once
        key={format}
        label={pin.label.trim() || 'PIN'}
        value={pin.value}
        onChangeText={t => onChange({ value: cleanPin(t, format) })}
        {...secretInputProps}
        secureTextEntry={!show}
        keyboardType={format === 'numeric' ? 'number-pad' : 'default'}
        maxLength={pinMax(format)}
      />
      <View style={s.pwTools}>
        <Text style={[s.hint, bad && s.hintBad]}>
          {PIN_MIN}–{pinMax(format)} {format === 'numeric' ? 'digits' : 'letters or digits'}
          {pin.value.length > 0 ? ` · ${pin.value.length} entered` : ''}
        </Text>
        <Button title={show ? 'Hide' : 'Show'} variant="soft" small onPress={() => setShow(v => !v)} />
      </View>
    </View>
  );
}

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
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 24, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 44, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  tabTextOn: { fontFamily: fonts.bold, color: colors.onPrimary },
  suggest: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
  suggestText: { fontFamily: fonts.bold, fontSize: 13, color: colors.warn },
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
