/**
 * AppContext — auth, family membership, realtime babies/feeds, and feed logging.
 *
 * After every feed log (by anyone — snapshots are realtime), the next-feed
 * prediction is recomputed and the local notification is rescheduled.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../lib/firebase';
import * as store from '../lib/store';
import {
  predictNextFeed,
  type Prediction,
  type FeedRecord,
  type MilkType,
} from '../lib/predict';
import { rescheduleNextFeedNotification } from '../lib/notifications';
import {
  ensureGuidelines,
  staticPayloadFor,
  type GuidelineState,
} from '../lib/llmGuidelines';

const FAMILY_KEY = '@milktracker:familyId';

interface LogFeedArgs {
  amountMl: number;
  milkType: MilkType;
  timestamp: number;
  note?: string;
}

interface AppState {
  user: User | null;
  authReady: boolean;
  displayName: string;
  familyId: string | null;
  family: store.Family | null;
  babies: store.Baby[];
  selectedBabyId: string | null;
  feeds: store.FeedDoc[];
  prediction: Prediction;
  saving: boolean;
  guidelines: GuidelineState | null;
  guidelinesRefreshing: boolean;
  refreshGuidelines: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  createFamily: (name: string) => Promise<string>;
  joinFamily: (code: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
  addBaby: (name: string, birthdate: string, location?: string) => Promise<void>;
  selectBaby: (id: string) => void;
  logFeed: (args: LogFeedArgs) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [familyId, setFamilyIdState] = useState<string | null>(null);
  const [family, setFamily] = useState<store.Family | null>(null);
  const [babies, setBabies] = useState<store.Baby[]>([]);
  const [selectedBabyId, setSelectedBabyId] = useState<string | null>(null);
  const [feeds, setFeeds] = useState<store.FeedDoc[]>([]);
  const [saving, setSaving] = useState(false);
  const [guidelines, setGuidelines] = useState<GuidelineState | null>(null);
  const [guidelinesRefreshing, setGuidelinesRefreshing] = useState(false);

  // Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Restore family on launch
  useEffect(() => {
    if (!user) {
      setFamilyIdState(null);
      return;
    }
    AsyncStorage.getItem(FAMILY_KEY)
      .then((v) => {
        if (v) setFamilyIdState(v);
      })
      .catch(() => {});
  }, [user]);

  const setFamilyId = useCallback(async (id: string | null) => {
    setFamilyIdState(id);
    try {
      if (id) await AsyncStorage.setItem(FAMILY_KEY, id);
      else await AsyncStorage.removeItem(FAMILY_KEY);
    } catch {
      // Non-fatal: family just won't persist across restarts.
    }
  }, []);

  // Family doc + device registration
  useEffect(() => {
    if (!familyId || !user) {
      setFamily(null);
      return;
    }
    let cancelled = false;
    store.getFamily(familyId).then((f) => {
      if (!cancelled) setFamily(f);
    });
    store.registerDevice(familyId, user.uid);
    return () => {
      cancelled = true;
    };
  }, [familyId, user]);

  // Realtime babies
  useEffect(() => {
    if (!familyId) {
      setBabies([]);
      return;
    }
    return store.subscribeBabies(familyId, (list) => {
      setBabies(list);
      setSelectedBabyId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    });
  }, [familyId]);

  // Realtime feeds for the selected baby
  useEffect(() => {
    if (!familyId) {
      setFeeds([]);
      return;
    }
    return store.subscribeFeeds(familyId, selectedBabyId, setFeeds);
  }, [familyId, selectedBabyId]);

  // Guidelines for the selected baby: cached LLM result when present,
  // otherwise the static table (computed locally, no network).
  useEffect(() => {
    if (!familyId || !selectedBabyId) {
      setGuidelines(null);
      return;
    }
    const baby = babies.find((b) => b.id === selectedBabyId);
    const applyStatic = () => {
      if (!baby) return;
      setGuidelines((prev) => {
        if (prev && prev.source !== 'static') return prev;
        return {
          source: 'static',
          payload: staticPayloadFor(baby.birthdate),
          ageBracket: '',
          location: baby.location ?? '',
          generatedAt: null,
        };
      });
    };
    applyStatic();
    return store.subscribeGuidelines(familyId, selectedBabyId, (cached) => {
      if (cached) {
        setGuidelines({
          source: 'cache',
          payload: cached.payload,
          ageBracket: cached.ageBracket,
          location: cached.location,
          generatedAt: cached.generatedAt,
        });
      } else {
        applyStatic();
      }
    });
  }, [familyId, selectedBabyId, babies]);

  const refreshGuidelines = useCallback(async () => {
    if (!familyId || !selectedBabyId) return;
    const baby = babies.find((b) => b.id === selectedBabyId);
    if (!baby) return;
    setGuidelinesRefreshing(true);
    try {
      const next = await ensureGuidelines({
        familyId,
        babyId: selectedBabyId,
        birthdateIso: baby.birthdate,
        location: baby.location,
        forceRefresh: true,
      });
      setGuidelines(next);
    } finally {
      setGuidelinesRefreshing(false);
    }
  }, [familyId, selectedBabyId, babies]);

  // Prediction from rolling actuals + notification reschedule
  const prediction: Prediction = useMemo(() => {
    const records: FeedRecord[] = feeds.map((f) => ({
      id: f.id,
      amountMl: f.amountMl,
      timestamp: f.timestamp,
      milkType: f.milkType,
    }));
    return predictNextFeed(records);
  }, [feeds]);

  useEffect(() => {
    rescheduleNextFeedNotification(prediction.nextFeedAtMs, prediction.suggestedAmountMl);
  }, [prediction.nextFeedAtMs, prediction.suggestedAmountMl]);

  const displayName = useMemo(() => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'Someone';
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(cred.user, { displayName: name.trim() });
    }
  }, []);

  const signOut = useCallback(async () => {
    await setFamilyId(null);
    setBabies([]);
    setFeeds([]);
    setSelectedBabyId(null);
    setFamily(null);
    await fbSignOut(auth);
  }, [setFamilyId]);

  const createFamily = useCallback(
    async (name: string) => {
      if (!user) throw new Error('Not signed in.');
      const { familyId: id, inviteCode } = await store.createFamily(name, user.uid);
      await setFamilyId(id);
      return inviteCode;
    },
    [user, setFamilyId],
  );

  const joinFamily = useCallback(
    async (code: string) => {
      if (!user) throw new Error('Not signed in.');
      const id = await store.joinFamily(code, user.uid);
      await setFamilyId(id);
    },
    [user, setFamilyId],
  );

  const leaveFamily = useCallback(async () => {
    await setFamilyId(null);
    setFamily(null);
    setBabies([]);
    setFeeds([]);
    setSelectedBabyId(null);
  }, [setFamilyId]);

  const addBaby = useCallback(
    async (name: string, birthdate: string, location?: string) => {
      if (!familyId) throw new Error('No family selected.');
      const id = await store.addBaby(familyId, { name, birthdate, location });
      setSelectedBabyId(id);
      // One-time LLM guideline seeding (one call per baby; static fallback
      // when no API key). Fire-and-forget: the guidelines subscription below
      // picks up the cached result when it lands.
      ensureGuidelines({ familyId, babyId: id, birthdateIso: birthdate, location }).catch(() => {});
    },
    [familyId],
  );

  const selectBaby = useCallback((id: string) => setSelectedBabyId(id), []);

  const logFeed = useCallback(
    async (args: LogFeedArgs) => {
      if (!familyId || !user || !selectedBabyId) throw new Error('Missing family, user, or baby.');
      setSaving(true);
      try {
        await store.logFeed(familyId, {
          babyId: selectedBabyId,
          amountMl: args.amountMl,
          milkType: args.milkType,
          timestamp: args.timestamp,
          recordedByUid: user.uid,
          recordedByName: displayName,
          note: args.note,
        });
      } finally {
        setSaving(false);
      }
    },
    [familyId, user, selectedBabyId, displayName],
  );

  const value: AppState = {
    user,
    authReady,
    displayName,
    familyId,
    family,
    babies,
    selectedBabyId,
    feeds,
    prediction,
    saving,
    guidelines,
    guidelinesRefreshing,
    refreshGuidelines,
    signIn,
    signUp,
    signOut,
    createFamily,
    joinFamily,
    leaveFamily,
    addBaby,
    selectBaby,
    logFeed,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
