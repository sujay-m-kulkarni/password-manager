/**
 * "How to use Vault": open from Setup, Unlock and Settings, without unlocking.
 * Holds no personal data, only instructions.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui';
import type { RootStackParamList } from '../../navigation/types';
import { colors, fonts } from '../../theme';
import { Icon } from '../../components/Icon';

type Section = { title: string; points: string[] };

export const HELP: Section[] = [
  {
    title: 'Getting started',
    points: [
      'Choose a master password: at least 12 characters, or 4 or more words like “purple mango river forty”. It is never stored, so nobody can tell you what it was.',
      'Vault then shows a 24-character recovery key, once. Write it on paper and keep it away from the phone. It is your way back if you forget the master password.',
      'Turn on fingerprint unlock so you rarely need to type the password.',
      'New phone with a backup? Tap “New phone? Restore from a backup” on the first screen instead.',
    ],
  },
  {
    title: 'Unlocking',
    points: [
      'With fingerprint on, Vault asks for it as soon as it opens. Tap the circle to try again.',
      'Once a week Vault asks for the master password instead, so you don’t forget it.',
      'Three wrong passwords in a row make you wait 30 seconds, then longer each time.',
      'Vault locks itself when you leave the app, turn off the screen, or after a minute without use (change it in Settings).',
    ],
  },
  {
    title: 'Saving passwords and PINs',
    points: [
      'Tap + on the Vault tab. One entry can hold a login, PINs and (for Banking) cards: the tabs Login · PINs · Cards show one part at a time, with a tick or count for what is filled in.',
      'On the PINs tab add as many PINs as the account has (UPI PIN, ATM PIN, MPIN…). An entry with only a PIN, like a phone lock, needs no password.',
      'A PIN can be Numbers (4–12 digits, typed on the number pad) or Letters & numbers (4–16, for app passcodes). Letters keep their capitals.',
      'Give each entry a type: Banking, Investments, Social media, Email or Other. The chips above the list show one type at a time; star the entries you use most and they appear at the top.',
      'Banking entries also hold the account number, IFSC and customer ID, and the account’s debit and credit cards (number, expiry, name on card and card PIN). The CVV is never stored.',
      'Investments entries (Zerodha, Groww…) hold the client ID and demat ID.',
      'Opening an entry shows it read-only; card numbers and PINs stay hidden until you tap Show. Tap Edit to change it on the same screen, then Save or Cancel.',
      'The PINs chip lists entries that hold PINs; search finds entries by name, username or website. Copy on the list copies the password, or the first PIN when there is no password.',
    ],
  },
  {
    title: 'Copying a password',
    points: [
      'Tap Copy next to an entry, switch to the other app and paste.',
      'The copied password is cleared after 30 seconds (or 15, in Settings), even though Vault locks when you switch apps.',
      'Screenshots of Vault come out black on purpose.',
    ],
  },
  {
    title: 'Backups',
    points: [
      'Vault never goes online, so your passwords exist only on this phone until you export a backup.',
      'Settings › Export backup saves an encrypted file. Choose Google Drive or another place off the phone.',
      'Automatic backup: in Settings › Backup choose a folder once. Vault then saves an encrypted backup there whenever your entries change, keeping the newest 5. The folder is not part of Vault, so the files stay if Vault is uninstalled.',
      'Uninstalling Vault deletes the vault unless you tick “Keep app data” in Android\'s uninstall dialog (uninstall from Settings › Apps to see it). Reinstalling Vault then opens the same vault; turn fingerprint unlock on again.',
      'A backup opens with the master password it was made with, or with your recovery key.',
      'Vault reminds you when there is no backup, or when you have made changes since a backup more than a month old.',
      'To move to a new phone: install Vault there, tap “Restore from a backup” and pick the file.',
    ],
  },
  {
    title: 'If something goes wrong',
    points: [
      'Forgot the master password: on the unlock screen tap “Forgot password? Use recovery key”, then choose a new password.',
      'Lost both the master password and the recovery key: the vault cannot be opened by anyone, including you. Keep the recovery key safe.',
      'Fingerprint stopped working (for example after changing the phone’s screen lock): unlock with the master password and turn it on again in Settings.',
      'Vault closed by itself: open it again and tap Share report on the screen that appears.',
    ],
  },
  {
    title: 'Keep it safe',
    points: [
      'Uninstalling Vault deletes the vault. Export a backup first, and install updates over the existing app instead.',
      'Never share your master password or recovery key. Vault will never ask for them anywhere except its own unlock screen.',
      'Vault has no internet access at all: nothing you save leaves the phone unless you export a backup yourself.',
    ],
  },
];

export function HelpScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'Help'>) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content}>
        <Button title="‹ Back" variant="ghost" small onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start' }} />
        <Text style={s.title}>How to use Vault</Text>
        <Text style={s.lead}>A password manager that keeps everything encrypted on this phone and never connects to the internet.</Text>
        {HELP.map((sec, i) => {
          const expanded = open === i;
          return (
            <View key={sec.title} style={s.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : i)}
                style={s.head}>
                <Text style={s.cardTitle}>{sec.title}</Text>
                <Icon name={expanded ? 'minus' : 'plus'} size={20} color={colors.primary} strokeWidth={2.5} />
              </Pressable>
              {expanded && (
                <View style={s.points}>
                  {sec.points.map(p => (
                    <View key={p} style={s.point}>
                      <View style={s.dot} />
                      <Text style={s.pointText}>{p}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  title: { fontFamily: fonts.extrabold, fontSize: 28, color: colors.ink, paddingHorizontal: 4 },
  lead: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.muted, paddingHorizontal: 4, marginBottom: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: 16, gap: 8 },
  cardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  points: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  point: { flexDirection: 'row', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  pointText: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
});
