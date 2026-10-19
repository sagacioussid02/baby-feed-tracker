/**
 * firebase.ts — Firebase initialization for the baby milk tracker.
 *
 * Configuration comes entirely from EXPO_PUBLIC_* environment variables
 * (baked in at build time by Expo). No secret values are hardcoded here.
 *
 * Required:  EXPO_PUBLIC_FIREBASE_PROJECT_ID, EXPO_PUBLIC_FIREBASE_API_KEY
 * Optional:  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN, EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
 *            EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, EXPO_PUBLIC_FIREBASE_APP_ID
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[firebase] Missing required environment variable: ${name}. ` +
        `Set it as an EXPO_PUBLIC_* variable before starting the app.`,
    );
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** The shared Firebase app instance (created once per process). */
export const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createAuth(app: FirebaseApp): Auth {
  if (Platform.OS === 'web') {
    // On web, Firebase handles persistence itself (IndexedDB/localStorage).
    return getAuth(app);
  }

  // On native, persist auth state in AsyncStorage so sessions survive restarts.
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Auth was already initialized (e.g. Fast Refresh re-ran this module).
    return getAuth(app);
  }
}

/** Firebase Auth instance, with platform-appropriate persistence. */
export const auth: Auth = createAuth(firebaseApp);

/** Firestore instance for the app's feeds / babies / users collections. */
export const db: Firestore = getFirestore(firebaseApp);
