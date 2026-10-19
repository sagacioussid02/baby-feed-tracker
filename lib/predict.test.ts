/**
 * predict.test.ts — jest tests for predict.ts.
 * Run with: npx jest lib
 */

import { predictNextFeed, formatCountdown, FeedRecord, MilkType } from './predict';

const HOUR_MS = 60 * 60 * 1000;
const BASE = 1_700_000_000_000; // fixed "now" for deterministic tests

let seq = 0;
function feed(amountMl: number, agoMs: number, milkType: MilkType = 'breast'): FeedRecord {
  seq += 1;
  return {
    id: `feed-${seq}`,
    amountMl,
    timestamp: BASE - agoMs,
    milkType,
  };
}

describe('predictNextFeed', () => {
  test('empty list → everything null, feedsUsed 0', () => {
    const p = predictNextFeed([]);
    expect(p).toEqual({
      nextFeedAtMs: null,
      suggestedAmountMl: null,
      avgAmountMl: null,
      avgIntervalMs: null,
      feedsUsed: 0,
      lastFeedAtMs: null,
    });
  });

  test('single feed → amounts computed, intervals null', () => {
    const p = predictNextFeed([feed(90, 2 * HOUR_MS)]);
    expect(p.feedsUsed).toBe(1);
    expect(p.avgAmountMl).toBe(90);
    expect(p.suggestedAmountMl).toBe(90);
    expect(p.avgIntervalMs).toBeNull();
    expect(p.nextFeedAtMs).toBeNull();
    expect(p.lastFeedAtMs).toBe(BASE - 2 * HOUR_MS);
  });

  test('two feeds → interval math', () => {
    // feeds 3h ago and 1h ago → gap of 2h; most recent is 1h ago
    const p = predictNextFeed([feed(90, 3 * HOUR_MS), feed(120, 1 * HOUR_MS)]);
    expect(p.feedsUsed).toBe(2);
    expect(p.avgAmountMl).toBe(105); // mean of 90, 120
    expect(p.avgIntervalMs).toBe(2 * HOUR_MS);
    expect(p.nextFeedAtMs).toBe(BASE - 1 * HOUR_MS + 2 * HOUR_MS);
    expect(p.suggestedAmountMl).toBe(105);
    expect(p.lastFeedAtMs).toBe(BASE - 1 * HOUR_MS);
  });

  test('unsorted input is sorted newest-first', () => {
    const oldest = feed(60, 5 * HOUR_MS);
    const middle = feed(90, 3 * HOUR_MS);
    const newest = feed(120, 1 * HOUR_MS);
    const p = predictNextFeed([middle, newest, oldest]); // deliberately shuffled
    expect(p.feedsUsed).toBe(3);
    expect(p.avgIntervalMs).toBe(2 * HOUR_MS); // gaps: 2h, 2h
    expect(p.lastFeedAtMs).toBe(newest.timestamp);
    expect(p.nextFeedAtMs).toBe(newest.timestamp + 2 * HOUR_MS);
  });

  test('windowSize truncates to the most recent feeds', () => {
    const feeds = [
      feed(50, 9 * HOUR_MS),
      feed(60, 8 * HOUR_MS),
      feed(70, 7 * HOUR_MS),
      feed(100, 1 * HOUR_MS),
    ];
    const p = predictNextFeed(feeds, { windowSize: 2 });
    expect(p.feedsUsed).toBe(2);
    expect(p.avgAmountMl).toBe(85); // mean of 100, 70
    expect(p.avgIntervalMs).toBe(6 * HOUR_MS); // gap between 1h-ago and 7h-ago
    expect(p.nextFeedAtMs).toBe(BASE - 1 * HOUR_MS + 6 * HOUR_MS);
  });

  test('windowSize defaults to 10', () => {
    const feeds: FeedRecord[] = [];
    for (let i = 0; i < 12; i++) {
      feeds.push(feed(100, (i + 1) * HOUR_MS));
    }
    const p = predictNextFeed(feeds);
    expect(p.feedsUsed).toBe(10);
  });

  test('zero and negative amounts are ignored', () => {
    const p = predictNextFeed([
      feed(0, 3 * HOUR_MS),
      feed(-10, 2 * HOUR_MS),
      feed(100, 1 * HOUR_MS),
    ]);
    expect(p.feedsUsed).toBe(1);
    expect(p.avgAmountMl).toBe(100);
    expect(p.avgIntervalMs).toBeNull();
  });

  test('all-zero amounts → treated as empty', () => {
    const p = predictNextFeed([feed(0, HOUR_MS), feed(0, 2 * HOUR_MS)]);
    expect(p.feedsUsed).toBe(0);
    expect(p.avgAmountMl).toBeNull();
    expect(p.lastFeedAtMs).toBeNull();
  });

  test('avgAmount rounds to nearest ml; avgInterval rounds to nearest minute', () => {
    // amounts 100 and 101 → 100.5 → 101
    // one gap of 2h 29s → rounds to 2h 0m
    const gap = 2 * HOUR_MS + 29_000;
    const newest = feed(100, 0);
    const older = feed(101, gap);
    const p = predictNextFeed([newest, older]);
    expect(p.avgAmountMl).toBe(101);
    expect(p.avgIntervalMs).toBe(2 * HOUR_MS); // 30s rounds down to the minute
  });

  test('interval rounds 31s up to the next minute', () => {
    const gap = HOUR_MS + 31_000;
    const p = predictNextFeed([feed(100, 0), feed(100, gap)]);
    expect(p.avgIntervalMs).toBe(HOUR_MS + 60_000);
  });

  test('non-positive gaps are excluded from the interval average', () => {
    // two feeds at the same timestamp, plus one 2h older → only the 2h gap counts
    const t = BASE - HOUR_MS;
    const p = predictNextFeed([
      { id: 'a', amountMl: 100, timestamp: t, milkType: 'breast' },
      { id: 'b', amountMl: 100, timestamp: t, milkType: 'breast' },
      feed(100, 3 * HOUR_MS),
    ]);
    expect(p.avgIntervalMs).toBe(2 * HOUR_MS);
  });
});

describe('formatCountdown', () => {
  test('"now" when diff is zero or negative', () => {
    expect(formatCountdown(BASE, BASE)).toBe('now');
    expect(formatCountdown(BASE - 1, BASE)).toBe('now');
    expect(formatCountdown(BASE - HOUR_MS, BASE)).toBe('now');
  });

  test('"45m" for sub-hour durations (rounded down)', () => {
    expect(formatCountdown(BASE + 45 * 60_000, BASE)).toBe('45m');
    expect(formatCountdown(BASE + 45 * 60_000 + 59_000, BASE)).toBe('45m'); // rounds down
    expect(formatCountdown(BASE + 59 * 60_000, BASE)).toBe('59m');
  });

  test('"2h 15m" style for hour-plus durations (rounded down)', () => {
    expect(formatCountdown(BASE + 2 * HOUR_MS + 15 * 60_000, BASE)).toBe('2h 15m');
    expect(formatCountdown(BASE + 2 * HOUR_MS + 15 * 60_000 + 59_000, BASE)).toBe('2h 15m');
    expect(formatCountdown(BASE + 1 * HOUR_MS, BASE)).toBe('1h 0m');
  });

  test('defaults nowMs to Date.now()', () => {
    const future = Date.now() + 30 * 60_000;
    expect(formatCountdown(future)).toBe('30m');
  });
});
