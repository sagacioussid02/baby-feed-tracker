/**
 * MilkTrack — baby milk tracker (Expo, iOS + web).
 *
 * Simple gated navigation (no router — keeps deps minimal for the MVP):
 *   loading → auth → family setup → main
 */

import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './context/AppContext';
import { colors } from './components/theme';
import AuthScreen from './screens/AuthScreen';
import FamilySetupScreen from './screens/FamilySetupScreen';
import MainScreen from './screens/MainScreen';

function Gate() {
  const { authReady, user, familyId } = useApp();

  if (!authReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>🍼</Text>
      </View>
    );
  }
  if (!user) return <AuthScreen />;
  if (!familyId) return <FamilySetupScreen />;
  return <MainScreen />;
}

export default function App() {
  return (
    <AppProvider>
      <View style={styles.root}>
        <StatusBar style="dark" />
        <Gate />
      </View>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 40, marginTop: 12 },
});
