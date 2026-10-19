/**
 * notifications.ts — local "next feed" reminder helpers.
 *
 * - Web: no-ops that resolve immediately (expo-notifications is native-only).
 * - Native: schedules a single pending "feeding time" reminder for the
 *   predicted next feed, cancelling any previously scheduled one first.
 * - Everything is wrapped in try/catch: notifications are best-effort and
 *   must never crash the app.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'feeding-reminders';

/** Id of the currently scheduled reminder, if any. */
let scheduledId: string | null = null;

/**
 * Request notification permission (and set up the Android channel).
 * Returns true when the app is allowed to show notifications.
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const requested = await Notifications.requestPermissionsAsync();
      granted = requested.granted;
    }
    if (granted && Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Feeding reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    return granted;
  } catch {
    return false;
  }
}

/**
 * Cancel the currently scheduled reminder, if one exists.
 */
export async function cancelNextFeedNotification(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  if (scheduledId === null) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(scheduledId);
  } catch {
    // Best effort — a stale id must not break the flow.
  } finally {
    scheduledId = null;
  }
}

/**
 * Replace any pending reminder with one for the predicted next feed.
 *
 * - `nextFeedAtMs` null or in the past → just cancel the old one and return.
 * - Otherwise schedule: title "Feeding time 🍼", body "About {n} ml" when an
 *   amount suggestion is available, else "Time for a feed".
 */
export async function rescheduleNextFeedNotification(
  nextFeedAtMs: number | null,
  suggestedAmountMl: number | null,
): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await cancelNextFeedNotification();

    if (nextFeedAtMs === null || nextFeedAtMs <= Date.now()) {
      return;
    }

    const body =
      suggestedAmountMl !== null && suggestedAmountMl > 0
        ? `About ${suggestedAmountMl} ml`
        : 'Time for a feed';

    scheduledId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Feeding time 🍼',
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(nextFeedAtMs),
      },
    });
  } catch {
    // Notifications are best-effort; never let them crash the app.
  }
}
