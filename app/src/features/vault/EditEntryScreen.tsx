import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Banner,
  Button,
  Field,
  StrengthBar,
  secretInputProps,
} from '../../components/ui';
import {
  PIN_MIN,
  cleanPin,
  getEntry,
  isValidPin,
  pinFormatOf,
  pinMax,
  type PinFormat,
  listFolders,
  saveEntry,
  type EntryKind,
} from '../../db/database';
import { GeneratorPanel } from '../generator/GeneratorPanel';
import { useDb, useSession } from '../../store/session';
import { colors, folderColor, fonts } from '../../theme';
import { estimateStrength } from '../../utils/strength';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Edit'>;

export function EditEntryScreen({ navigation, route }: Props) {
  const db = useDb();
  const touchData = useSession(st => st.touchData);
  const editingId = route.params?.id;
  const existing = useMemo(
    () => (editingId != null ? getEntry(db, editingId) : null),
    [db, editingId],
  );
  const folders = useMemo(() => listFolders(db), [db]);

  const [kind, setKind] = useState<EntryKind>(
    existing?.kind ?? route.params?.kind ?? 'login',
  );
  const pin = kind === 'pin';
  const [pinFormat, setPinFormat] = useState<PinFormat>(
    existing?.kind === 'pin' ? pinFormatOf(existing.password) : 'numeric',
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [username, setUsername] = useState(existing?.username ?? '');
  const [password, setPassword] = useState(existing?.password ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [folderId, setFolderId] = useState<number | null>(
    existing?.folder_id ?? route.params?.folderId ?? null,
  );
  const [favorite, setFav] = useState(!!existing?.favorite);
  const [showPw, setShowPw] = useState(false);
  const [genOpen, setGenOpen] = useState(false);

  // Android back button closes the sheet first.
  useEffect(() => {
    if (!genOpen) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setGenOpen(false);
      return true;
    });
    return () => sub.remove();
  }, [genOpen]);
  const [error, setError] = useState<string | null>(null);

  const pinInvalid =
    pin && password.length > 0 && !isValidPin(password, pinFormat);
  const canSave =
    title.trim().length > 0 &&
    password.length > 0 &&
    (!pin || isValidPin(password, pinFormat));

  const switchPinFormat = (next: PinFormat) => {
    setPinFormat(next);
    setPassword(p => cleanPin(p, next)); // letters are dropped when going to numbers only
    setError(null);
  };
  const strength = estimateStrength(password);

  const switchKind = (next: EntryKind) => {
    if (next === kind) {
      return;
    }
    setKind(next);
    // Keep the secret if it still fits (any PIN is a valid password; a password is a valid PIN only
    // if it is 4–12 digits); switching back to the saved type restores what was saved.
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
      saveEntry(
        db,
        {
          kind,
          folder_id: folderId,
          title,
          username,
          password,
          url,
          notes,
          favorite,
        },
        editingId,
      );
      touchData();
      // Back to the list of entries, new or edited, also when editing was opened from the entry's page.
      navigation.popTo('Tabs', { screen: 'Vault' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.bar}>
        <Button
          title="Cancel"
          variant="ghost"
          small
          onPress={() => navigation.goBack()}
        />
        <Text style={s.barTitle}>
          {editingId != null ? 'Edit' : 'New'} {pin ? 'PIN' : 'password'}
        </Text>
        <Button title="Save" small onPress={onSave} disabled={!canSave} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="height">
        <ScrollView
          contentContainerStyle={s.form}
          keyboardShouldPersistTaps="handled"
        >
          {/* Shown when adding and when editing, so a saved entry can change between Login and PIN. */}
          <View style={s.kindRow} accessibilityRole="radiogroup">
            <KindButton
              label="Login"
              hint="Username and password"
              active={!pin}
              onPress={() => switchKind('login')}
            />
            <KindButton
              label="PIN"
              hint="Phone, SIM, ATM, UPI"
              active={pin}
              onPress={() => switchKind('pin')}
            />
          </View>
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder={
              pin ? 'e.g. Phone lock, HDFC ATM, UPI' : 'e.g. HDFC NetBanking'
            }
            autoFocus={editingId == null}
          />
          {pin ? (
            <View style={{ gap: 8 }}>
              <View style={s.formatRow} accessibilityRole="radiogroup">
                <FormatChip
                  label="Numbers"
                  active={pinFormat === 'numeric'}
                  onPress={() => switchPinFormat('numeric')}
                />
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
                <Text style={[s.pinHint, pinInvalid && s.pinHintBad]}>
                  {PIN_MIN}–{pinMax(pinFormat)}{' '}
                  {pinFormat === 'numeric' ? 'digits' : 'letters or digits'}
                  {password.length > 0 ? ` · ${password.length} entered` : ''}
                </Text>
                <Button
                  title={showPw ? 'Hide' : 'Show'}
                  variant="soft"
                  small
                  onPress={() => setShowPw(v => !v)}
                />
              </View>
            </View>
          ) : (
            <>
              <Field
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                importantForAutofill="no"
              />
              <View style={{ gap: 8 }}>
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  {...secretInputProps}
                  secureTextEntry={!showPw}
                />
                <View style={s.pwTools}>
                  <View style={{ flex: 1 }}>
                    {password.length > 0 && (
                      <StrengthBar
                        score={strength.score}
                        label={strength.label}
                      />
                    )}
                  </View>
                  <Button
                    title={showPw ? 'Hide' : 'Show'}
                    variant="soft"
                    small
                    onPress={() => setShowPw(v => !v)}
                  />
                  <Button
                    title="Generate"
                    small
                    onPress={() => setGenOpen(true)}
                  />
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
            </>
          )}

          <View style={{ gap: 8 }}>
            <Text style={s.label}>Folder</Text>
            <View style={s.chips}>
              <FolderChip
                label="None"
                active={folderId == null}
                onPress={() => setFolderId(null)}
              />
              {folders.map(f => (
                <FolderChip
                  key={f.id}
                  label={f.name}
                  color={f.color}
                  active={folderId === f.id}
                  onPress={() => setFolderId(f.id)}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: favorite }}
            onPress={() => setFav(v => !v)}
            style={s.favRow}
          >
            <Text style={s.favText}>Add to favorites</Text>
            <View style={[s.switch, favorite && s.switchOn]}>
              <View style={[s.knob, favorite && s.knobOn]} />
            </View>
          </Pressable>

          <Field
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          {error && <Banner text={error} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* In-screen overlay, not <Modal>: a Modal is a separate window without FLAG_SECURE. */}
      {genOpen && (
        <View style={StyleSheet.absoluteFill}>
          <Pressable
            style={s.scrim}
            accessibilityLabel="Close generator"
            onPress={() => setGenOpen(false)}
          />
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
    </SafeAreaView>
  );
}

function KindButton({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.kindBtn, active && s.kindBtnOn]}
    >
      <Text style={[s.kindLabel, active && s.kindLabelOn]}>{label}</Text>
      <Text style={[s.kindHint, active && s.kindHintOn]}>{hint}</Text>
    </Pressable>
  );
}

function FormatChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.formatChip, active && s.formatChipOn]}
    >
      <Text style={[s.formatText, active && s.formatTextOn]}>{label}</Text>
    </Pressable>
  );
}

function FolderChip({
  label,
  color,
  active,
  onPress,
}: {
  label: string;
  color?: string;
  active: boolean;
  onPress: () => void;
}) {
  const c = folderColor(color);
  const bg = active
    ? color
      ? c.solid
      : colors.ink
    : color
    ? c.soft
    : colors.surface;
  const fg = active ? colors.onPrimary : color ? c.ink : colors.inkSoft;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: bg }]}
    >
      <Text style={[s.chipText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  barTitle: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  form: { padding: 16, gap: 16, paddingBottom: 40 },
  pwTools: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: 'center',
  },
  chipText: { fontFamily: fonts.bold, fontSize: 14 },
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
  switch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.raised,
    padding: 3,
  },
  switchOn: { backgroundColor: colors.primary },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
  },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.onPrimary },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  sheetTitle: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  kindRow: { flexDirection: 'row', gap: 8 },
  formatRow: { flexDirection: 'row', gap: 8 },
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
  pinHint: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  pinHintBad: { color: colors.danger },
});
