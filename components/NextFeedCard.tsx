/**
 * NextFeedCard — "next feed in Xh Ym · ~Z ml" from rolling actuals.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, shared } from './theme';
import { formatCountdown, type Prediction } from '../lib/predict';

function formatInterval(ms: number | null): string {
  if (ms === null) return '—';
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function NextFeedCard({ prediction }: { prediction: Prediction }) {
  const { nextFeedAtMs, suggestedAmountMl, avgAmountMl, avgIntervalMs, feedsUsed } = prediction;

  return (
    <View style={[shared.card, styles.hero]}>
      <Text style={shared.cardTitle}>⏰ Next feed</Text>
      {nextFeedAtMs === null ? (
        <Text style={styles.empty}>
          {feedsUsed === 0
            ? 'Log your first feed below and I’ll start predicting.'
            : 'Log one more feed and I’ll predict the next one.'}
        </Text>
      ) : (
        <>
          <Text style={styles.countdown}>{formatCountdown(nextFeedAtMs)}</Text>
          <Text style={styles.suggest}>
            {suggestedAmountMl !== null ? `~${suggestedAmountMl} ml` : ''}
          </Text>
          <Text style={styles.meta}>
            Based on your last {feedsUsed} feeds · avg {avgAmountMl} ml every {formatInterval(avgIntervalMs)}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: '#2D2A26' },
  countdown: { fontSize: 44, fontWeight: '800', color: '#fff' },
  suggest: { fontSize: 22, fontWeight: '700', color: colors.primary, marginTop: 2 },
  meta: { fontSize: 13, color: '#B9AFA6', marginTop: 10, lineHeight: 18 },
  empty: { fontSize: 16, color: '#D8CFC7', lineHeight: 22 },
});
