/**
 * llmGuidelines.test.ts — unit tests for the pure parts of llmGuidelines.
 * (Firestore cache paths are intentionally not covered here; they need a
 * live backend. The prompt/validation/bracket logic is what must be right.)
 */

import {
  getAgeBracket,
  ageWeeksFromBirthdate,
  validatePayload,
  buildUserPrompt,
  staticPayloadFor,
} from './llmGuidelines';

describe('getAgeBracket', () => {
  test('bracket boundaries', () => {
    expect(getAgeBracket(0)).toBe('0-1m');
    expect(getAgeBracket(0.9)).toBe('0-1m');
    expect(getAgeBracket(1)).toBe('1-3m');
    expect(getAgeBracket(2.99)).toBe('1-3m');
    expect(getAgeBracket(3)).toBe('3-6m');
    expect(getAgeBracket(5.99)).toBe('3-6m');
    expect(getAgeBracket(6)).toBe('6-12m');
    expect(getAgeBracket(11.99)).toBe('6-12m');
    expect(getAgeBracket(12)).toBe('12m+');
  });

  test('invalid input', () => {
    expect(getAgeBracket(-1)).toBe('unknown');
    expect(getAgeBracket(NaN)).toBe('unknown');
  });
});

describe('ageWeeksFromBirthdate', () => {
  test('computes whole weeks', () => {
    const now = new Date('2026-10-19T12:00:00Z').getTime();
    const born = new Date(now - 21 * 24 * 3600 * 1000);
    const iso = born.toISOString().slice(0, 10);
    expect(ageWeeksFromBirthdate(iso, now)).toBe(3);
  });

  test('bad input → 0', () => {
    expect(ageWeeksFromBirthdate('not-a-date')).toBe(0);
  });
});

const validRaw = {
  feedsPerDay: { min: 6, max: 8 },
  amountPerFeedMl: { min: 90, max: 150 },
  totalDailyMl: { min: 700, max: 950 },
  nightFeedsExpected: '2-3 night feeds typical',
  notes: ['General guidance only. Consult your pediatrician.'],
};

describe('validatePayload', () => {
  test('accepts a well-formed payload', () => {
    const p = validatePayload(validRaw);
    expect(p).not.toBeNull();
    expect(p?.feedsPerDay).toEqual({ min: 6, max: 8 });
  });

  test('rejects min > max', () => {
    expect(validatePayload({ ...validRaw, feedsPerDay: { min: 8, max: 6 } })).toBeNull();
  });

  test('rejects non-positive and non-integer values', () => {
    expect(validatePayload({ ...validRaw, totalDailyMl: { min: 0, max: 900 } })).toBeNull();
    expect(validatePayload({ ...validRaw, amountPerFeedMl: { min: 90.5, max: 150 } })).toBeNull();
  });

  test('rejects missing / wrong-typed fields', () => {
    expect(validatePayload(null)).toBeNull();
    expect(validatePayload({})).toBeNull();
    expect(validatePayload({ ...validRaw, notes: 'not-an-array' })).toBeNull();
    expect(validatePayload({ ...validRaw, nightFeedsExpected: '' })).toBeNull();
  });

  test('rejects absurd values', () => {
    expect(validatePayload({ ...validRaw, totalDailyMl: { min: 700, max: 5000 } })).toBeNull();
    expect(validatePayload({ ...validRaw, feedsPerDay: { min: 6, max: 30 } })).toBeNull();
  });

  test('trims and caps notes', () => {
    const p = validatePayload({ ...validRaw, notes: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] });
    expect(p?.notes).toHaveLength(6);
  });
});

describe('buildUserPrompt privacy', () => {
  test('contains age and location only — no name or family details possible', () => {
    const prompt = buildUserPrompt(8, '1-3m', 'United States');
    expect(prompt).toContain('8 weeks');
    expect(prompt).toContain('United States');
    // The builder only receives age/location; assert the shape has no slots for anything else.
    expect(prompt).not.toMatch(/@|\bname:/i);
    expect(prompt).not.toContain('FAMILY');
  });

  test('blank location falls back to unspecified region', () => {
    expect(buildUserPrompt(2, '0-1m', '')).toContain('unspecified region');
    expect(buildUserPrompt(2, '0-1m', '   ')).toContain('unspecified region');
  });
});

describe('staticPayloadFor', () => {
  test('newborn maps to a sane payload', () => {
    const now = Date.now();
    const born = new Date(now - 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const p = staticPayloadFor(born);
    expect(p.feedsPerDay.min).toBeGreaterThan(0);
    expect(p.totalDailyMl.max).toBeGreaterThan(p.totalDailyMl.min);
    expect(p.notes.join(' ')).toMatch(/pediatrician/i);
  });

  test('over-12-months returns the explanatory payload', () => {
    const born = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const p = staticPayloadFor(born);
    expect(p.notes.join(' ')).toMatch(/0–12 months/);
  });
});
