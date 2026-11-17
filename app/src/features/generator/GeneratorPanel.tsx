import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, StrengthBar } from '../../components/ui';
import { getSetting, setSetting } from '../../db/database';
import { useDb } from '../../store/session';
import { colors, fonts } from '../../theme';
import { Icon } from '../../components/Icon';
import {
  DEFAULT_GENERATOR,
  MAX_LENGTH,
  MIN_LENGTH,
  charKind,
  generatePassword,
  generatedEntropyBits,
  type GeneratorOptions,
} from '../../utils/generator';

const KIND_COLOR = { letter: colors.ink, digit: '#9FD0E6', symbol: colors.warn };
const LENGTH_STEPS = [12, 16, 20, 24, 32];

const TOGGLES: { key: 'upper' | 'lower' | 'digits' | 'symbols'; label: string; bg: string; fg: string }[] = [
  { key: 'upper', label: 'A–Z', bg: '#2A3348', fg: '#A9C0E8' },
  { key: 'lower', label: 'a–z', bg: '#26362C', fg: '#A8D4B5' },
  { key: 'digits', label: '0–9', bg: '#233540', fg: '#9FD0E6' },
  { key: 'symbols', label: '!@#$', bg: '#3A3125', fg: '#E8C79E' },
];

/** Score for a generated password, from its true entropy (it's uniformly random). */
function generatedStrength(o: GeneratorOptions) {
  const bits = generatedEntropyBits(o);
  const score = bits < 28 ? 0 : bits < 40 ? 1 : bits < 55 ? 2 : bits < 75 ? 3 : 4;
  return { score, label: ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'][score] };
}

/**
 * Generator UI shared by the Generator tab and the Add/Edit bottom sheet.
 * Options are remembered in the vault's settings table.
 */
export function GeneratorPanel({
  primaryAction,
}: {
  primaryAction: { title: string; onPress: (password: string) => void };
}) {
  const db = useDb();
  const [opts, setOpts] = useState<GeneratorOptions>(() => {
    try {
      const saved = getSetting(db, 'generator');
      return saved ? { ...DEFAULT_GENERATOR, ...JSON.parse(saved) } : DEFAULT_GENERATOR;
    } catch {
      return DEFAULT_GENERATOR;
    }
  });
  const [pw, setPw] = useState(() => generatePassword(opts));

  const regenerate = useCallback((o: GeneratorOptions) => setPw(generatePassword(o)), []);

  useEffect(() => {
    setSetting(db, 'generator', JSON.stringify(opts));
  }, [db, opts]);

  const update = (patch: Partial<GeneratorOptions>) => {
    const next = { ...opts, ...patch };
    const anySet = next.upper || next.lower || next.digits || next.symbols;
    if (!anySet) {
      return; // keep at least one character type
    }
    setOpts(next);
    regenerate(next);
  };

  const strength = generatedStrength(opts);

  return (
    <View style={s.wrap}>
      <View style={s.display}>
        <Text style={s.pw} accessibilityLabel="Generated password" selectable={false}>
          {pw.split('').map((c, i) => (
            <Text key={i} style={{ color: KIND_COLOR[charKind(c)] }}>
              {c}
            </Text>
          ))}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Generate another" onPress={() => regenerate(opts)} style={s.again}>
          <Icon name="refresh" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>

      <StrengthBar score={strength.score} label={strength.label} />

      <View style={{ gap: 8 }}>
        <View style={s.lenHead}>
          <Text style={s.label}>Length</Text>
          <View style={s.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Shorter"
              onPress={() => update({ length: Math.max(MIN_LENGTH, opts.length - 1) })}
              style={s.stepBtn}>
              <Icon name="minus" size={20} color={colors.primary} strokeWidth={2.5} />
            </Pressable>
            <Text style={s.lenValue}>{opts.length}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Longer"
              onPress={() => update({ length: Math.min(MAX_LENGTH, opts.length + 1) })}
              style={s.stepBtn}>
              <Icon name="plus" size={20} color={colors.primary} strokeWidth={2.5} />
            </Pressable>
          </View>
        </View>
        <View style={s.quick}>
          {LENGTH_STEPS.map(n => (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ checked: opts.length === n }}
              onPress={() => update({ length: n })}
              style={[s.quickBtn, opts.length === n && s.quickOn]}>
              <Text style={[s.quickText, opts.length === n && s.quickTextOn]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={s.grid}>
        {TOGGLES.map(t => {
          const on = opts[t.key];
          return (
            <Pressable
              key={t.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => update({ [t.key]: !on })}
              style={[s.toggle, { backgroundColor: on ? t.bg : colors.surface, borderColor: on ? t.bg : colors.border }]}>
              <Text style={[s.toggleText, { color: on ? t.fg : colors.muted }]}>
                {on ? '✓ ' : ''}
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: opts.avoidLookAlikes }}
        onPress={() => update({ avoidLookAlikes: !opts.avoidLookAlikes })}
        style={s.switchRow}>
        <Text style={s.switchLabel}>Avoid look-alikes (I l 1 O 0 o)</Text>
        <View style={[s.switch, opts.avoidLookAlikes && s.switchOn]}>
          <View style={[s.knob, opts.avoidLookAlikes && s.knobOn]} />
        </View>
      </Pressable>

      <Button title={primaryAction.title} onPress={() => primaryAction.onPress(pw)} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 16 },
  display: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.deep, borderRadius: 20, padding: 16 },
  pw: { flex: 1, fontFamily: 'monospace', fontSize: 18, lineHeight: 26 },
  again: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.inkSoft, alignItems: 'center', justifyContent: 'center' },
  lenHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  lenValue: { minWidth: 32, textAlign: 'center', fontFamily: fonts.extrabold, fontSize: 18, color: colors.primary },
  quick: { flexDirection: 'row', gap: 6 },
  quickBtn: { flex: 1, height: 40, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  quickOn: { backgroundColor: colors.primary },
  quickText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  quickTextOn: { color: colors.onPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { width: '48%', flexGrow: 1, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontFamily: fonts.bold, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  switchLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft, flex: 1 },
  switch: { width: 48, height: 28, borderRadius: 14, backgroundColor: colors.raised, padding: 3 },
  switchOn: { backgroundColor: colors.primary },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.ink },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.onPrimary },
});
