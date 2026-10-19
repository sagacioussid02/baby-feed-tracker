/** MainScreen — next-feed card, log card, timeline, baby profile. */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import { colors, shared } from '../components/theme';
import { useApp } from '../context/AppContext';
import LogFeedCard from '../components/LogFeedCard';
import { FeedClock } from '../components/FeedClock';
import FeedTimeline from '../components/FeedTimeline';
import BabyCard from '../components/BabyCard';
import { ensureNotificationPermissions } from '../lib/notifications';
import { useReducedMotion } from '../lib/useReducedMotion';
import type { FeedDoc } from '../lib/store';

const MILK_LABEL: Record<string, string> = {
  breast: '🤱 Breast',
  formula: '🍼 Formula',
  pumped: '💧 Pumped',
  mixed: '🔀 Mixed',
};

function formatDetailTime(ts: number): string {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function AddBabyForm({ onDone }: { onDone: () => void }) {
  const { addBaby } = useApp();
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Enter the baby’s name.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate.trim())) {
      setError('Birthdate must be YYYY-MM-DD.');
      return;
    }
    setBusy(true);
    try {
      await addBaby(name, birthdate.trim(), location.trim() || undefined);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Could not add the baby.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={shared.card}>
      <Text style={shared.cardTitle}>👶 Add your baby</Text>
      <TextInput
        style={shared.input}
        placeholder="Baby’s name"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={shared.input}
        placeholder="Birthdate (YYYY-MM-DD)"
        placeholderTextColor={colors.muted}
        value={birthdate}
        onChangeText={setBirthdate}
        keyboardType="numbers-and-punctuation"
      />
      <TextInput
        style={shared.input}
        placeholder="Location — country/region (optional, e.g. United States)"
        placeholderTextColor={colors.muted}
        value={location}
        onChangeText={setLocation}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[shared.bigButton, busy && { opacity: 0.6 }]}
        onPress={submit}
        disabled={busy}
      >
        <Text style={shared.bigButtonText}>Add baby</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function MainScreen() {
  const {
    family,
    babies,
    selectedBabyId,
    selectBaby,
    feeds,
    prediction,
    logFeed,
    saving,
    signOut,
    leaveFamily,
    guidelines,
    guidelinesRefreshing,
    refreshGuidelines,
  } = useApp();
  const [showAddBaby, setShowAddBaby] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<FeedDoc | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    ensureNotificationPermissions();
  }, []);

  // Clear a tapped clock marker when switching babies.
  useEffect(() => {
    setSelectedFeed(null);
  }, [selectedBabyId]);

  const baby = babies.find((b) => b.id === selectedBabyId) ?? null;

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <View style={styles.header}>
        <View>
          <Text style={styles.familyName}>{family?.name ?? '…'}</Text>
          {family && <Text style={styles.invite}>Invite code: {family.inviteCode}</Text>}
        </View>
        <TouchableOpacity
          onPress={() => {
            signOut();
          }}
        >
          <Text style={styles.signout}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {babies.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.babyRow}>
          {babies.map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[shared.chip, b.id === selectedBabyId && shared.chipActive]}
              onPress={() => selectBaby(b.id)}
            >
              <Text style={shared.chipText}>👶 {b.name}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={shared.chip} onPress={() => setShowAddBaby(true)}>
            <Text style={shared.chipText}>＋ Add</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {(showAddBaby || babies.length === 0) && (
        <AddBabyForm onDone={() => setShowAddBaby(false)} />
      )}

      {baby && (
        <>
          <FeedClock
            feeds={feeds}
            prediction={prediction}
            reduceMotion={reduceMotion}
            selectedFeedId={selectedFeed?.id ?? null}
            onSelectFeed={setSelectedFeed}
          />
          {selectedFeed && (
            <View style={styles.feedDetail}>
              <View>
                <Text style={styles.feedDetailTitle}>
                  {selectedFeed.amountMl} ml · {MILK_LABEL[selectedFeed.milkType] ?? selectedFeed.milkType}
                </Text>
                <Text style={styles.feedDetailSub}>
                  {formatDetailTime(selectedFeed.timestamp)} · by {selectedFeed.recordedByName}
                  {selectedFeed.note ? ` · “${selectedFeed.note}”` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedFeed(null)}>
                <Text style={styles.feedDetailClose}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <LogFeedCard
            onSave={(form) => logFeed(form)}
            saving={saving}
            reduceMotion={reduceMotion}
          />
          <BabyCard
            baby={baby}
            feeds={feeds}
            prediction={prediction}
            guidelines={guidelines}
            onRefreshGuidelines={refreshGuidelines}
            refreshing={guidelinesRefreshing}
          />
          <FeedTimeline feeds={feeds} />
        </>
      )}

      <TouchableOpacity style={styles.leave} onPress={leaveFamily}>
        <Text style={styles.leaveText}>Switch family</Text>
      </TouchableOpacity>
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingTop: 54, paddingBottom: 10 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 18,
    marginBottom: 2,
  },
  familyName: { fontSize: 24, fontWeight: '800', color: colors.ink },
  invite: { fontSize: 13, color: colors.muted, marginTop: 2 },
  signout: { color: colors.muted, fontSize: 14 },
  babyRow: { marginTop: 12, paddingHorizontal: 16 },
  error: { color: '#C0392B', fontSize: 14, marginBottom: 8 },
  feedDetail: {
    backgroundColor: '#FFF4E6',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F0DCC0',
  },
  feedDetailTitle: { fontSize: 16, fontWeight: '700', color: colors.ink },
  feedDetailSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  feedDetailClose: { fontSize: 18, color: colors.muted, padding: 6 },
  leave: { marginTop: 20, alignItems: 'center' },
  leaveText: { color: colors.muted, fontSize: 14 },
});
