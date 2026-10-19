/**
 * predict.ts — pure feed-timing prediction logic.
 *
 * This module is intentionally dependency-free: it contains no imports,
 * no I/O, and no side effects, so it can be unit-tested in plain Node and
 * later swapped out (or augmented) by a real ML-based insight pipeline.
 *
 * Contract:
 *   - Inputs are plain data (`FeedRecord[]`); outputs are plain data (`Prediction`).
 *   - Feeds with `amountMl <= 0` are ignored (they carry no information about volume).
 *   - Feeds are treated as an unordered event log: they are sorted
 *     newest-first, then truncated to the most recent `windowSize` entries.
 *   - Intervals are computed only from positive gaps between consecutive
 *     feeds (guards against out-of-order or duplicate timestamps slipping
 *     through, even though we sort first).
 */

export type MilkType = 'breast' | 'formula' | 'pumped' | 'mixed';

export interface FeedRecord {
  id: string;
  amountMl: number;
  timestamp: number; // epoch ms
  milkType: MilkType;
}

export interface Prediction {
  /** Predicted timestamp of the next feed, or null when unknowable. */
  nextFeedAtMs: number | null;
  /** Rounded average amount, offered as the suggested next-feed amount. */
  suggestedAmountMl: number | null;
  /** Mean of the amounts used, rounded to the nearest ml. */
  avgAmountMl: number | null;
  /** Mean of the inter-feed gaps, rounded to the nearest minute. */
  avgIntervalMs: number | null;
  /** How many feeds went into the averages. */
  feedsUsed: number;
  /** Timestamp of the most recent feed used, or null if there were none. */
  lastFeedAtMs: number | null;
}

export interface PredictOptions {
  /** How many of the most recent feeds to use. Defaults to 10. */
  windowSize?: number;
}

const MINUTE_MS = 60_000;

function roundToMinute(ms: number): number {
  return Math.round(ms / MINUTE_MS) * MINUTE_MS;
}

/**
 * Predict the next feed from a history of feed records.
 *
 * Algorithm (deliberately simple and explainable):
 *   1. Drop records with `amountMl <= 0`.
 *   2. Sort remaining records newest-first.
 *   3. Keep the most recent `windowSize` (default 10).
 *   4. `avgAmountMl` = mean of amounts, rounded to nearest ml.
 *   5. `avgIntervalMs` = mean of positive gaps between consecutive feeds,
 *      rounded to the nearest minute (null when < 2 feeds).
 *   6. `nextFeedAtMs` = newest feed's timestamp + avgIntervalMs
 *      (null when the interval is unknowable).
 *   7. `suggestedAmountMl` mirrors `avgAmountMl`.
 */
export function predictNextFeed(feeds: FeedRecord[], opts?: PredictOptions): Prediction {
  const windowSize = opts?.windowSize ?? 10;

  const valid = feeds.filter((f) => f.amountMl > 0);
  if (valid.length === 0) {
    return {
      nextFeedAtMs: null,
      suggestedAmountMl: null,
      avgAmountMl: null,
      avgIntervalMs: null,
      feedsUsed: 0,
      lastFeedAtMs: null,
    };
  }

  const sorted = [...valid].sort((a, b) => b.timestamp - a.timestamp);
  const window = sorted.slice(0, windowSize);

  const avgAmountMl = Math.round(
    window.reduce((sum, f) => sum + f.amountMl, 0) / window.length,
  );

  let avgIntervalMs: number | null = null;
  if (window.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < window.length - 1; i++) {
      const gap = window[i].timestamp - window[i + 1].timestamp;
      if (gap > 0) {
        gaps.push(gap);
      }
    }
    if (gaps.length > 0) {
      avgIntervalMs = roundToMinute(
        gaps.reduce((sum, g) => sum + g, 0) / gaps.length,
      );
    }
  }

  const lastFeedAtMs = window[0].timestamp;

  return {
    nextFeedAtMs: avgIntervalMs === null ? null : lastFeedAtMs + avgIntervalMs,
    suggestedAmountMl: avgAmountMl,
    avgAmountMl,
    avgIntervalMs,
    feedsUsed: window.length,
    lastFeedAtMs,
  };
}

/**
 * Render a human-friendly countdown to a predicted feed time.
 *
 * - diff <= 0 → "now"
 * - < 1 hour  → "45m" (minutes, rounded down)
 * - ≥ 1 hour  → "2h 15m" (hours + remaining minutes, rounded down)
 */
export function formatCountdown(nextFeedAtMs: number, nowMs: number = Date.now()): string {
  const diffMs = nextFeedAtMs - nowMs;
  if (diffMs <= 0) {
    return 'now';
  }
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}
