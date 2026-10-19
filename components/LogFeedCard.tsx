/**
 * LogFeedCard — the 3am one-handed feed logger, now playful.
 *
 * An animated Skia milk bottle fills as the amount is chosen (pure visual
 * feedback — presets stay one-tap so the flow is still <10s), milk-type
 * chips bounce on select, and saving fires haptics + a confetti burst.
 */
import React, { useRef, useState } from 'react';
import {
  Animated,
  Platform,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, shared } from './theme';
import { mlToOz, ozToMl } from '../lib/guidelines';
import type { MilkType } from '../lib/predict';
import { MilkBottle } from './MilkBottle';
import { ConfettiBurst } from './ConfettiBurst';

export interface LogFeedForm {
  amountMl: number;
  milkType: MilkType;
  timestamp: number;
  note: string;
}

const PRESETS_ML = [60, 90, 120, 150, 180];
const MILK_TYPES: { value: MilkType; label: string }[] = [
  { value: 'breast', label: '🤱 Breast' },
  { value: 'formula', label: '🍼 Formula' },
  { value: 'pumped', label: '💧 Pumped' },
  { value: 'mixed', label: '🔀 Mixed' },
];

function formatClock(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Chunky chip with a springy bounce on press (RN Animated, UI thread). */
function BouncyChip({
  active,
  onPress,
  children,
  style,
}: {
  active?: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: object;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const handle = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, useNativeDriver: true, speed: 60, bounciness: 10 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 60, bounciness: 10 }),
    ]).start();
    onPress();
  };
  return (
    <TouchableOpacity onPress={handle} activeOpacity={0.85}>
      <Animated.View
        style={[shared.chip, active && shared.chipActive, style, { transform: [{ scale }] }]}
      >
        <Text style={shared.chipText}>{children}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function LogFeedCard({
  onSave,
  saving,
  reduceMotion,
}: {
  onSave: (form: LogFeedForm) => Promise<void>;
  saving: boolean;
  reduceMotion: boolean;
}) {
  const [unit, setUnit] = useState<'ml' | 'oz'>('ml');
  const [presetMl, setPresetMl] = useState<number | null>(120);
  const [customText, setCustomText] = useState('');
  const [milkType, setMilkType] = useState<MilkType>('breast');
  const [offsetMin, setOffsetMin] = useState(0);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);

  const displayAmount = (ml: number) =>
    unit === 'ml' ? `${ml} ml` : `${mlToOz(ml).toFixed(1)} oz`;

  const effectiveMl = (): number | null => {
    if (customText.trim()) {
      const n = parseFloat(customText.trim());
      if (isNaN(n) || n <= 0) return null;
      return Math.round(unit === 'ml' ? n : ozToMl(n));
    }
    return presetMl;
  };

  const feedTime = Date.now() + offsetMin * 60_000;

  const handleSave = async () => {
    const ml = effectiveMl();
    if (ml === null || ml <= 0) {
      setError('Enter an amount greater than 0.');
      return;
    }
    setError(null);
    try {
      // Satisfying save moment: haptic + confetti. Haptics is native-only.
      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          /* haptics unavailable — not fatal */
        }
      }
      await onSave({ amountMl: ml, milkType, timestamp: feedTime, note: note.trim() });
      setBurstKey((k) => k + 1);
      setCustomText('');
      setOffsetMin(0);
      setNote('');
    } catch (e: any) {
      setError(e?.message ?? 'Could not save the feed.');
    }
  };

  return (
    <View style={shared.card}>
      <Text style={shared.cardTitle}>🍼 Log a feed</Text>

      <View style={styles.bottleWrap}>
        <MilkBottle amountMl={effectiveMl() ?? 0} reduceMotion={reduceMotion} />
        <View style={styles.confetti} pointerEvents="none">
          <ConfettiBurst burstKey={burstKey} reduceMotion={reduceMotion} />
        </View>
      </View>

      <Text style={shared.label}>Amount ({unit})</Text>
      <View style={styles.row}>
        {PRESETS_ML.map((ml) => {
          const active = presetMl === ml && !customText.trim();
          return (
            <BouncyChip
              key={ml}
              active={active}
              style={styles.preset}
              onPress={() => {
                setPresetMl(ml);
                setCustomText('');
              }}
            >
              {displayAmount(ml)}
            </BouncyChip>
          );
        })}
      </View>
      <View style={styles.row}>
        <TextInput
          style={[shared.input, styles.customInput]}
          placeholder={unit === 'ml' ? 'Custom ml' : 'Custom oz'}
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          value={customText}
          onChangeText={setCustomText}
        />
        <TouchableOpacity
          style={[shared.chip, styles.unitToggle]}
          onPress={() => setUnit(unit === 'ml' ? 'oz' : 'ml')}
        >
          <Text style={shared.chipText}>{unit === 'ml' ? 'ml → oz' : 'oz → ml'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={shared.label}>Milk type</Text>
      <View style={styles.row}>
        {MILK_TYPES.map((t) => (
          <BouncyChip key={t.value} active={milkType === t.value} onPress={() => setMilkType(t.value)}>
            {t.label}
          </BouncyChip>
        ))}
      </View>

      <Text style={shared.label}>Time</Text>
      <View style={styles.timeRow}>
        <TouchableOpacity style={shared.chip} onPress={() => setOffsetMin((o) => o - 15)}>
          <Text style={shared.chipText}>−15m</Text>
        </TouchableOpacity>
        <Text style={styles.clock}>{formatClock(feedTime)}</Text>
        <TouchableOpacity style={shared.chip} onPress={() => setOffsetMin((o) => Math.min(o + 15, 0))}>
          <Text style={shared.chipText}>+15m</Text>
        </TouchableOpacity>
        {offsetMin !== 0 && (
          <TouchableOpacity style={shared.chip} onPress={() => setOffsetMin(0)}>
            <Text style={shared.chipText}>Now</Text>
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={[shared.input, { marginTop: 6 }]}
        placeholder="Note (optional)"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[shared.bigButton, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={shared.bigButtonText}>{saving ? 'Saving…' : '✓ Save feed'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  preset: { minWidth: 88, alignItems: 'center' },
  customInput: { flex: 1, marginRight: 10, marginBottom: 10 },
  unitToggle: { marginBottom: 10 },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  clock: { fontSize: 26, fontWeight: '800', color: colors.ink, marginHorizontal: 14 },
  error: { color: '#C0392B', fontSize: 14, marginTop: 4 },
  bottleWrap: { alignItems: 'center', marginBottom: 2 },
  confetti: { position: 'absolute', top: -10, alignItems: 'center' },
});
