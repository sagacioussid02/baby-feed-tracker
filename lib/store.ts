/**
 * store.ts — Firestore data layer for the baby milk tracker.
 *
 * Collections:
 *   families/{familyId}                         { name, inviteCode, memberUids, createdAt }
 *   families/{familyId}/babies/{babyId}          { name, birthdate, notes, createdAt }
 *   families/{familyId}/feeds/{feedId}           { babyId, amountMl, milkType, timestamp, recordedByUid, recordedByName, note }
 *   families/{familyId}/devices/{deviceId}       { uid, platform, expoPushToken, updatedAt }
 *
 * Reads are membership-gated by firestore.rules (uid must be in memberUids).
 * Feed queries intentionally avoid composite indexes: we order by timestamp
 * only and filter babyId client-side.
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { db } from './firebase';
import type { MilkType } from './predict';
import type { GuidelineCacheDoc } from './llmGuidelines';

export interface Family {
  id: string;
  name: string;
  inviteCode: string;
  memberUids: string[];
}

export interface Baby {
  id: string;
  name: string;
  birthdate: string; // ISO YYYY-MM-DD
  /** Country/region, e.g. "United States" — used for region-aware guidelines. */
  location?: string;
  notes?: string;
}

export interface FeedDoc {
  id: string;
  babyId: string;
  amountMl: number;
  milkType: MilkType;
  timestamp: number; // epoch ms
  recordedByUid: string;
  recordedByName: string;
  note?: string;
}

export interface LogFeedInput {
  babyId: string;
  amountMl: number;
  milkType: MilkType;
  timestamp: number;
  recordedByUid: string;
  recordedByName: string;
  note?: string;
}

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Short, unambiguous invite code (no 0/O, 1/I/L). */
export function generateInviteCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export async function createFamily(
  name: string,
  uid: string,
): Promise<{ familyId: string; inviteCode: string }> {
  const inviteCode = generateInviteCode();
  const ref = await addDoc(collection(db, 'families'), {
    name: name.trim(),
    inviteCode,
    memberUids: [uid],
    createdAt: serverTimestamp(),
  });
  return { familyId: ref.id, inviteCode };
}

export async function joinFamily(inviteCode: string, uid: string): Promise<string> {
  const code = inviteCode.trim().toUpperCase();
  if (!code) throw new Error('Enter an invite code.');
  const q = query(collection(db, 'families'), where('inviteCode', '==', code), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error('No family found for that invite code.');
  const docSnap = snap.docs[0];
  const memberUids: string[] = docSnap.data().memberUids ?? [];
  if (!memberUids.includes(uid)) {
    await setDoc(docSnap.ref, { memberUids: [...memberUids, uid] }, { merge: true });
  }
  return docSnap.id;
}

export async function findFamilyIdForUser(uid: string): Promise<string | null> {
  const q = query(collection(db, 'families'), where('memberUids', 'array-contains', uid), limit(1));
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

export async function getFamily(familyId: string): Promise<Family | null> {
  const snap = await getDoc(doc(db, 'families', familyId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    name: d.name,
    inviteCode: d.inviteCode,
    memberUids: d.memberUids ?? [],
  };
}

export async function addBaby(
  familyId: string,
  input: { name: string; birthdate: string; location?: string; notes?: string },
): Promise<string> {
  const ref = await addDoc(collection(db, 'families', familyId, 'babies'), {
    name: input.name.trim(),
    birthdate: input.birthdate,
    location: input.location?.trim() || '',
    notes: input.notes ?? '',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function logFeed(familyId: string, input: LogFeedInput): Promise<string> {
  if (!(input.amountMl > 0)) throw new Error('Amount must be greater than 0.');
  const ref = await addDoc(collection(db, 'families', familyId, 'feeds'), {
    babyId: input.babyId,
    amountMl: Math.round(input.amountMl),
    milkType: input.milkType,
    timestamp: input.timestamp,
    recordedByUid: input.recordedByUid,
    recordedByName: input.recordedByName,
    note: input.note ?? '',
  });
  return ref.id;
}

/** Realtime babies list, oldest first. */
export function subscribeBabies(familyId: string, cb: (babies: Baby[]) => void): Unsubscribe {
  const q = query(collection(db, 'families', familyId, 'babies'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            birthdate: data.birthdate,
            location: data.location || undefined,
            notes: data.notes,
          };
        }),
      );
    },
    (err) => console.warn('[store] babies snapshot error', err),
  );
}

/**
 * Realtime feed list, newest first. babyId is filtered client-side to avoid
 * requiring a composite Firestore index for the MVP.
 */
export function subscribeFeeds(
  familyId: string,
  babyId: string | null,
  cb: (feeds: FeedDoc[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'families', familyId, 'feeds'),
    orderBy('timestamp', 'desc'),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FeedDoc, 'id'>) }));
      cb(babyId ? all.filter((f) => f.babyId === babyId) : all);
    },
    (err) => console.warn('[store] feeds snapshot error', err),
  );
}

/**
 * Realtime subscription to the cached LLM guidelines for a baby
 * (families/{familyId}/babies/{babyId}/guidelines/current).
 * Null = no cached guidelines yet (UI falls back to the static table).
 */
export function subscribeGuidelines(
  familyId: string,
  babyId: string,
  cb: (doc: GuidelineCacheDoc | null) => void,
): Unsubscribe {
  const ref = doc(db, 'families', familyId, 'babies', babyId, 'guidelines', 'current');
  return onSnapshot(
    ref,
    (snap) => cb(snap.exists() ? (snap.data() as GuidelineCacheDoc) : null),
    (err) => console.warn('[store] guidelines snapshot error', err),
  );
}

/**
 * Best-effort device registration for the future server-push (v2) path.
 * Never throws; local notifications work regardless.
 */
export async function registerDevice(familyId: string, uid: string): Promise<void> {
  try {
    let expoPushToken: string | null = null;
    if (Platform.OS !== 'web') {
      try {
        const token = await Notifications.getExpoPushTokenAsync();
        expoPushToken = token.data;
      } catch {
        // Push token is best-effort; local scheduled notifications still work.
      }
    }
    const deviceId = `${uid}-${Platform.OS}`;
    await setDoc(
      doc(db, 'families', familyId, 'devices', deviceId),
      { uid, platform: Platform.OS, expoPushToken, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.warn('[store] registerDevice failed', e);
  }
}
