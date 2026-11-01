import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { pingActivity } from '../security/AutoLock';
import { colors, fonts, radius } from '../theme';

type Variant = 'primary' | 'dark' | 'soft' | 'danger' | 'ghost' | 'white';

const variantStyle: Record<Variant, { bg: string; fg: string }> = {
  primary: { bg: colors.primary, fg: colors.white },
  dark: { bg: colors.ink, fg: colors.white },
  soft: { bg: colors.primarySoft, fg: colors.primary },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  ghost: { bg: 'transparent', fg: colors.inkSoft },
  white: { bg: colors.white, fg: colors.ink },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  small,
  style,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = variantStyle[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: v.bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: v.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...input
}: TextInputProps & { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        autoCorrect={false}
        {...input}
        onChangeText={t => {
          pingActivity();
          input.onChangeText?.(t);
        }}
        style={[styles.input, input.multiline && styles.inputMulti]}
      />
    </View>
  );
}

/** Password fields: no autocorrect, no suggestions, no keyboard learning. */
export const secretInputProps: TextInputProps = {
  secureTextEntry: true,
  autoCapitalize: 'none',
  autoCorrect: false,
  autoComplete: 'off',
  importantForAutofill: 'no',
  textContentType: 'none',
  spellCheck: false,
  contextMenuHidden: false,
};

export function StrengthBar({ score, label }: { score: number; label: string }) {
  const segColors = ['#E5484D', '#F59E0B', '#16A34A', '#16A34A'];
  const textColor = score >= 3 ? colors.success : score === 2 ? '#B45309' : colors.danger;
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.strengthRow}>
        {segColors.map((c, i) => (
          <View key={i} style={[styles.strengthSeg, { backgroundColor: i < score ? c : '#DDD8EE' }]} />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: textColor }]}>{label}</Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children.toUpperCase()}</Text>;
}

export function Banner({ text, tone = 'danger' }: { text: string; tone?: 'danger' | 'warn' }) {
  const t = tone === 'danger' ? { bg: colors.dangerSoft, fg: colors.danger } : { bg: colors.warnSoft, fg: colors.warnInk };
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Text style={[styles.bannerText, { color: t.fg }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: { height: 56, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonSmall: { height: 44, borderRadius: radius.sm, paddingHorizontal: 14 },
  buttonText: { fontFamily: fonts.bold, fontSize: 17 },
  buttonTextSmall: { fontSize: 15 },
  field: { gap: 6 },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
  },
  inputMulti: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  strengthRow: { flexDirection: 'row', gap: 4 },
  strengthSeg: { flex: 1, height: 6, borderRadius: 3 },
  strengthLabel: { fontFamily: fonts.bold, fontSize: 13 },
  section: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted, letterSpacing: 0.4 },
  banner: { borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: 14 },
  bannerText: { fontFamily: fonts.semibold, fontSize: 14 },
});
