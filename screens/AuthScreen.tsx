/** AuthScreen — email/password sign in / sign up. */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { colors, shared } from '../components/theme';
import { useApp } from '../context/AppContext';

export default function AuthScreen() {
  const { signIn, signUp } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password, name);
    } catch (e: any) {
      setError(friendly(e?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.logo}>🍼</Text>
        <Text style={styles.title}>MilkTrack</Text>
        <Text style={styles.sub}>One family, every feed, always in sync.</Text>

        <View style={shared.card}>
          {mode === 'up' && (
            <TextInput
              style={shared.input}
              placeholder="Your name (shown on feeds)"
              placeholderTextColor={colors.muted}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          )}
          <TextInput
            style={shared.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={shared.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={[shared.bigButton, busy && { opacity: 0.6 }]}
            onPress={submit}
            disabled={busy}
          >
            <Text style={shared.bigButtonText}>
              {busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.switch}
            onPress={() => {
              setMode(mode === 'in' ? 'up' : 'in');
              setError(null);
            }}
          >
            <Text style={styles.switchText}>
              {mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendly(msg?: string): string {
  if (!msg) return 'Something went wrong.';
  if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password'))
    return 'Wrong email or password.';
  if (msg.includes('auth/email-already-in-use')) return 'That email already has an account — sign in.';
  if (msg.includes('auth/weak-password')) return 'Password should be at least 6 characters.';
  if (msg.includes('auth/invalid-email')) return 'That email doesn’t look right.';
  return msg.replace(/^Firebase:\s*/, '');
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  logo: { fontSize: 64, textAlign: 'center' },
  title: { fontSize: 34, fontWeight: '800', color: colors.ink, textAlign: 'center', marginTop: 8 },
  sub: { fontSize: 16, color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  error: { color: '#C0392B', fontSize: 14, marginBottom: 8 },
  switch: { marginTop: 14, alignItems: 'center' },
  switchText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
