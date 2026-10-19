/**
 * FeedTimeline — shared realtime feed history with who recorded each feed.
 */

import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { colors, shared } from './theme';
import type { FeedDoc } from '../lib/store';

const TYPE_LABEL: Record<string, string> = {
  breast: '🤱 Breast',
  formula: '🍼 Formula',
  pumped: '💧 Pumped',
  mixed: '🔀 Mixed',
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dayLabel = isToday ? 'Today' : d.toDateString() === yesterday.toDateString() ? 'Yesterday' : d.toLocaleDateString();
  return `${dayLabel} ${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export default function FeedTimeline({ feeds }: { feeds: FeedDoc[] }) {
  return (
    <View style={shared.card}>
      <Text style={shared.cardTitle}>📋 Recent feeds</Text>
      {feeds.length === 0 ? (
        <Text style={styles.empty}>Nothing logged yet — the family timeline will appear here.</Text>
      ) : (
        <FlatList
          data={feeds.slice(0, 30)}
          keyExtractor={(f) => f.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.main}>
                <Text style={styles.amount}>{item.amountMl} ml</Text>
                <Text style={styles.type}>{TYPE_LABEL[item.milkType] ?? item.milkType}</Text>
              </View>
              <View style={styles.side}>
                <Text style={styles.time}>{formatTime(item.timestamp)}</Text>
                <Text style={styles.by}>by {item.recordedByName}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  sep: { height: 1, backgroundColor: colors.line, marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  main: { flexDirection: 'row', alignItems: 'baseline' },
  amount: { fontSize: 20, fontWeight: '800', color: colors.ink },
  type: { fontSize: 14, color: colors.muted, marginLeft: 10 },
  side: { alignItems: 'flex-end' },
  time: { fontSize: 14, fontWeight: '600', color: colors.ink },
  by: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
