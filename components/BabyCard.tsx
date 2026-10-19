/**
 * BabyCard — baby profile: age, today's intake vs guideline, and
 * "your baby's actual pattern" next to the guideline so the adaptation
 * is visible.
 *
 * The guideline side is seeded by a one-time LLM call per age bracket
 * (cached in Firestore); without an API key it falls back to the built-in
 * static table. See lib/llmGuidelines.ts.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, shared } from './theme';
import type { Baby } from '../lib/store';
import type { FeedDoc } from '../lib/store';
import type { Prediction } from '../lib/predict';
import {
  getAgeBracket,
  type GuidelineState,
} from '../lib/llmGuidelines';
import {
  ageInMonths,
  formatAge,
  mlToOz,
  MEDICAL_DISCLAIMER,
} from '../lib/guidelines';

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtRange(min: number, max: number, unit: string): string {
  if (min === 0 && max === 0) return '—';
  return min === max ? `${min} ${unit}` : `${min}–${max} ${unit}`;
}

export default function BabyCard({
  baby,
  feeds,
  prediction,
  guidelines,
  onRefreshGuidelines,
  refreshing,
}: {
  baby: Baby;
  feeds: FeedDoc[];
  prediction: Prediction;
  guidelines: GuidelineState | null;
  onRefreshGuidelines: () => void;
  refreshing: boolean;
}) {
  const months = ageInMonths(baby.birthdate);
  const currentBracket = getAgeBracket(months);
  const todayTotal = feeds
    .filter((f) => f.timestamp >= startOfToday())
    .reduce((sum, f) => sum + f.amountMl, 0);

  const p = guidelines?.payload ?? null;
  const isAI = guidelines !== null && guidelines.source !== 'static';
  const bracketChanged =
    guidelines !== null && guidelines.ageBracket !== '' && guidelines.ageBracket !== currentBracket;

  return (
    <View style={shared.card}>
      <Text style={styles.name}>
        👶 {baby.name} <Text style={styles.age}>· {formatAge(baby.birthdate)}</Text>
      </Text>

      <View style={styles.cols}>
        <View style={styles.col}>
          <Text style={shared.label}>
            {isAI ? `Starting point (AI${guidelines.location ? ` · ${guidelines.location}` : ''})` : 'Textbook guideline'}
          </Text>
          {p ? (
            <>
              <Text style={styles.big}>{fmtRange(p.totalDailyMl.min, p.totalDailyMl.max, 'ml/day')}</Text>
              <Text style={styles.sub}>
                ≈ {fmtRange(Math.round(p.totalDailyMl.min / 29.5735), Math.round(p.totalDailyMl.max / 29.5735), 'oz/day')}
                {'\n'}
                {fmtRange(p.feedsPerDay.min, p.feedsPerDay.max, 'feeds/day')}
                {'\n'}
                {fmtRange(p.amountPerFeedMl.min, p.amountPerFeedMl.max, 'ml/feed')}
              </Text>
              <Text style={styles.note}>🌙 {p.nightFeedsExpected}</Text>
              {p.notes.slice(0, 2).map((n, i) => (
                <Text key={i} style={styles.note}>
                  • {n}
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.sub}>Loading guidance…</Text>
          )}
          {bracketChanged && (
            <Text style={styles.nudge}>
              Baby entered a new age bracket — refresh for updated guidance.
            </Text>
          )}
          <TouchableOpacity
            style={[styles.refreshBtn, refreshing && { opacity: 0.6 }]}
            onPress={onRefreshGuidelines}
            disabled={refreshing}
          >
            <Text style={styles.refreshText}>
              {refreshing ? 'Refreshing…' : '↻ Refresh guidelines'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.col, styles.colRight]}>
          <Text style={shared.label}>Your baby's pattern</Text>
          {prediction.avgAmountMl !== null ? (
            <>
              <Text style={styles.big}>~{prediction.avgAmountMl} ml/feed</Text>
              <Text style={styles.sub}>
                {prediction.avgIntervalMs !== null
                  ? `every ~${Math.round(prediction.avgIntervalMs / 3600000 * 10) / 10}h`
                  : 'interval TBD'}
                {'\n'}last {prediction.feedsUsed} feeds
              </Text>
            </>
          ) : (
            <Text style={styles.sub}>Log feeds to reveal the pattern.</Text>
          )}
          <Text style={[styles.big, { marginTop: 10 }]}>{todayTotal} ml</Text>
          <Text style={styles.sub}>today ({mlToOz(todayTotal).toFixed(1)} oz)</Text>
        </View>
      </View>

      <Text style={styles.disclaimer}>{MEDICAL_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 20, fontWeight: '800', color: colors.ink, marginBottom: 12 },
  age: { fontSize: 15, fontWeight: '600', color: colors.muted },
  cols: { flexDirection: 'row' },
  col: { flex: 1 },
  colRight: { borderLeftWidth: 1, borderLeftColor: colors.line, paddingLeft: 14, marginLeft: 4 },
  big: { fontSize: 18, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
  note: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 16, fontStyle: 'italic' },
  nudge: {
    fontSize: 13,
    color: colors.primaryDark,
    fontWeight: '700',
    marginTop: 10,
    lineHeight: 18,
  },
  refreshBtn: {
    marginTop: 10,
    backgroundColor: colors.chip,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  refreshText: { color: colors.primaryDark, fontSize: 14, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: colors.muted, marginTop: 14, lineHeight: 15, fontStyle: 'italic' },
});
