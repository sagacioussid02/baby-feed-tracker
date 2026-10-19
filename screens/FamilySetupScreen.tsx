/** FamilySetupScreen — create a family (get invite code) or join with one. */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { colors, shared } from '../components/theme';
import { useApp } from '../context/AppContext';

export default function FamilySetupScreen() {
  const { createFamily, joinFamily, signOut, displayName } = useApp();
  const [familyName, setFamilyName] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doCreate = async () => {
    setError(null);
    if (!familyName.trim()) {
      setError('Give your family a name.');
      return;
    }
    setBusy(true);
    try {
      const inviteCode = await createFamily(familyName);
      setCreatedCode(inviteCode);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create the family.');
    } finally {
      setBusy(false);
    }
  };

  const doJoin = async () => {
    setError(null);
    setBusy(true);
    try {
      await joinFamily(code);
    } catch (e: any) {
      setError(e?.message ?? 'Could not join the family.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.inner}>
      <Text style={styles.hello}>Hi {displayName} 👋</Text>
      <Text style={styles.sub}>Feeds are shared with your whole family in realtime.</Text>

      {createdCode ? (
        <View style={shared.card}>
          <Text style={shared.cardTitle}>Family created 🎉</Text>
          <Text style={styles.codeLabel}>Share this invite code with your family:</Text>
          <Text style={styles.code} selectable>
            {createdCode}
          </Text>
          <Text style={styles.hint}>
            They'll enter it on this same screen after signing up. You're in — add your baby next.
          </Text>
        </View>
      ) : (
        <>
          <View style={shared.card}>
            <Text style={shared.cardTitle}>Create a family</Text>
            <TextInput
              style={shared.input}
              placeholder="Family name (e.g. The Sharmas)"
              placeholderTextColor={colors.muted}
              value={familyName}
              onChangeText={setFamilyName}
            />
            <TouchableOpacity
              style={[shared.bigButton, busy && { opacity: 0.6 }]}
              onPress={doCreate}
              disabled={busy}
            >
              <Text style={shared.bigButtonText}>Create family</Text>
            </TouchableOpacity>
          </View>

          <View style={shared.card}>
            <Text style={shared.cardTitle}>Or join with an invite code</Text>
            <TextInput
              style={[shared.input, styles.codeInput]}
              placeholder="ABC123"
              placeholderTextColor={colors.muted}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[shared.bigButton, busy && { opacity: 0.6 }]}
              onPress={doJoin}
              disabled={busy}
            >
              <Text style={shared.bigButtonText}>Join family</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {error && (
        <View style={shared.card}>
          <Text style={styles.error}>{error}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.signout} onPress={signOut}>
        <Text style={styles.signoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  inner: { paddingVertical: 48, paddingBottom: 40 },
  hello: { fontSize: 26, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  sub: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 6 },
  codeLabel: { fontSize: 15, color: colors.muted, marginBottom: 8 },
  code: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    letterSpacing: 6,
    marginVertical: 12,
  },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  codeInput: { textAlign: 'center', fontSize: 24, letterSpacing: 4, fontWeight: '700' },
  error: { color: '#C0392B', fontSize: 14 },
  signout: { marginTop: 18, alignItems: 'center' },
  signoutText: { color: colors.muted, fontSize: 14 },
});
