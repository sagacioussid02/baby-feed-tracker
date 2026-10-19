/**
 * firebase-auth-rn.d.ts — type augmentation for firebase/auth on React Native.
 *
 * firebase v13 exposes `getReactNativePersistence` only under the
 * `react-native` export condition (./dist/rn/index.js), which Metro resolves
 * on device. TypeScript resolves the default (browser) types, where the
 * export doesn't exist — so we augment the module here. At runtime on iOS
 * the real implementation is used; on web this code path is never hit
 * (firebase.ts uses getAuth there).
 */
import type { Persistence } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }): Persistence;
}
