/**
 * llmGuidelines.ts — one-time LLM-seeded feeding guidelines per baby.
 *
 * Design (per spec):
 * - When a baby profile is created, the app makes ONE LLM call with the
 *   baby's AGE (weeks, derived from birthdate) and LOCATION (country/region)
 *   to generate personalized initial feeding heuristics. Regional norms
 *   differ (e.g. WHO vs AAP), hence the location input.
 * - The result is cached in Firestore at
 *     families/{familyId}/babies/{babyId}/guidelines/current
 *   with fields { generatedAt, ageWeeks, ageBracket, location, source,
 *   provider, payload }. The same age bracket is never generated twice —
 *   the cache is reused.
 * - Re-seed triggers: baby crosses into a new age bracket, or the user taps
 *   "refresh guidelines" (forceRefresh).
 * - Provider is behind a small interface (OpenAI default; Anthropic can be
 *   swapped in later).
 * - PRIVACY: only age + location are ever sent to the LLM. Never the baby's
 *   name, family details, or any identifier. (See buildUserPrompt.)
 * - Graceful fallback: no API key or any failure → built-in static table
 *   (guidelines.ts). The app works fully without a key.
 * - Cost: one call per baby profile + one per bracket refresh — negligible
 *   (a few hundred tokens on a mini model).
 *
 * The rolling-average prediction engine (predict.ts) stays deterministic and
 * local; the LLM output only seeds the "textbook guideline" side of the
 * comparison in BabyCard.
 */

import { doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { getGuideline, ageInMonths, type IntakeGuideline } from './guidelines';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structured guideline payload — the exact JSON shape requested from the LLM. */
export interface GuidelinePayload {
  feedsPerDay: { min: number; max: number };
  amountPerFeedMl: { min: number; max: number };
  totalDailyMl: { min: number; max: number };
  nightFeedsExpected: string;
  notes: string[];
}

export interface GuidelineCacheDoc {
  generatedAt: number; // epoch ms (client clock)
  ageWeeks: number;
  ageBracket: string;
  location: string;
  source: 'llm';
  provider: string;
  payload: GuidelinePayload;
}

export type GuidelineSource = 'llm' | 'cache' | 'static';

export interface GuidelineState {
  source: GuidelineSource;
  payload: GuidelinePayload;
  ageBracket: string;
  location: string;
  generatedAt: number | null; // null for the static fallback
}

// ---------------------------------------------------------------------------
// Age brackets — the cache key. A new bracket is a re-seed trigger.
// ---------------------------------------------------------------------------

export function getAgeBracket(ageMonths: number): string {
  if (!isFinite(ageMonths) || ageMonths < 0) return 'unknown';
  if (ageMonths < 1) return '0-1m';
  if (ageMonths < 3) return '1-3m';
  if (ageMonths < 6) return '3-6m';
  if (ageMonths < 12) return '6-12m';
  return '12m+';
}

export function ageWeeksFromBirthdate(birthdateIso: string, nowMs: number = Date.now()): number {
  const born = new Date(birthdateIso + 'T00:00:00').getTime();
  if (isNaN(born)) return 0;
  return Math.max(0, Math.floor((nowMs - born) / (7 * 24 * 3600 * 1000)));
}

// ---------------------------------------------------------------------------
// Provider interface (OpenAI default; Anthropic swappable later)
// ---------------------------------------------------------------------------

export interface GuidelineProvider {
  readonly name: string;
  /** Returns the raw parsed JSON from the model. May throw. */
  generate(input: { ageWeeks: number; ageBracket: string; location: string }): Promise<unknown>;
}

const SYSTEM_PROMPT = [
  'You are a pediatric feeding guidance assistant.',
  'Provide GENERAL infant feeding guidance only. Never diagnose, never prescribe, never give medical advice for a specific child.',
  'Regional feeding norms differ (e.g. WHO vs AAP guidance); consider the norms for the provided location.',
  'You MUST include a "consult your pediatrician" disclaimer in the notes.',
  'Respond with STRICT JSON only — no markdown fences, no commentary — matching exactly this shape:',
  '{',
  '  "feedsPerDay": {"min": <int>, "max": <int>},',
  '  "amountPerFeedMl": {"min": <int>, "max": <int>},',
  '  "totalDailyMl": {"min": <int>, "max": <int>},',
  '  "nightFeedsExpected": "<short string>",',
  '  "notes": ["<string>", "..."]',
  '}',
].join('\n');

/**
 * PRIVACY: this is the ONLY data ever sent to the LLM — age in weeks and a
 * location string. Baby name, family details, and identifiers are never
 * included. Callers must not add them.
 */
export function buildUserPrompt(ageWeeks: number, ageBracket: string, location: string): string {
  const loc = location?.trim() ? location.trim().slice(0, 80) : 'unspecified region';
  return (
    `Baby age: ${ageWeeks} weeks (age bracket ${ageBracket}). ` +
    `Location: ${loc}. ` +
    `Provide general feeding guidance for this age and region as strict JSON.`
  );
}

export class OpenAIGuidelineProvider implements GuidelineProvider {
  readonly name = 'openai';
  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o-mini',
  ) {}

  async generate(input: { ageWeeks: number; ageBracket: string; location: string }): Promise<unknown> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildUserPrompt(input.ageWeeks, input.ageBracket, input.location),
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 600,
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI request failed (HTTP ${res.status})`);
    const json = await res.json();
    const text: unknown = json?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Empty model response');
    return JSON.parse(text); // throws on malformed JSON → caller retries once
  }
}

// Example shape for a future Anthropic swap-in:
//   export class AnthropicGuidelineProvider implements GuidelineProvider {
//     readonly name = 'anthropic';
//     constructor(private apiKey: string, private model = 'claude-haiku-...') {}
//     async generate(input) { /* POST https://api.anthropic.com/v1/messages ... */ }
//   }

// ---------------------------------------------------------------------------
// Validation — never trust model output; validate before saving.
// ---------------------------------------------------------------------------

function isPosInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0;
}

function validRange(r: unknown): r is { min: number; max: number } {
  return (
    !!r &&
    typeof r === 'object' &&
    isPosInt((r as { min?: unknown }).min) &&
    isPosInt((r as { max?: unknown }).max) &&
    (r as { min: number; max: number }).min <= (r as { min: number; max: number }).max
  );
}

/** Returns a sanitized payload, or null when the model output is unusable. */
export function validatePayload(raw: unknown): GuidelinePayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!validRange(r.feedsPerDay) || !validRange(r.amountPerFeedMl) || !validRange(r.totalDailyMl)) {
    return null;
  }
  if (typeof r.nightFeedsExpected !== 'string' || !r.nightFeedsExpected.trim()) return null;
  if (!Array.isArray(r.notes) || !r.notes.every((n) => typeof n === 'string')) return null;
  // Sanity caps — reject absurd outputs.
  if (r.totalDailyMl.max > 2000 || r.feedsPerDay.max > 24 || r.amountPerFeedMl.max > 500) return null;
  return {
    feedsPerDay: r.feedsPerDay,
    amountPerFeedMl: r.amountPerFeedMl,
    totalDailyMl: r.totalDailyMl,
    nightFeedsExpected: r.nightFeedsExpected.trim().slice(0, 200),
    notes: (r.notes as string[]).slice(0, 6).map((s) => s.slice(0, 280)),
  };
}

// ---------------------------------------------------------------------------
// Static fallback — the original MVP behavior, adapted to the payload shape.
// ---------------------------------------------------------------------------

const ML_PER_OZ = 29.5735;

export function staticPayloadFor(birthdateIso: string): GuidelinePayload {
  const g: IntakeGuideline | null = getGuideline(ageInMonths(birthdateIso));
  if (!g) {
    return {
      feedsPerDay: { min: 0, max: 0 },
      amountPerFeedMl: { min: 0, max: 0 },
      totalDailyMl: { min: 0, max: 0 },
      nightFeedsExpected: '—',
      notes: ['Built-in guidelines cover 0–12 months. Ask your pediatrician for guidance.'],
    };
  }
  const [fMin, fMax] = g.typicalFeedsPerDay;
  const minMl = Math.round(g.minOzPerDay * ML_PER_OZ);
  const maxMl = Math.round(g.maxOzPerDay * ML_PER_OZ);
  return {
    feedsPerDay: { min: fMin, max: fMax },
    amountPerFeedMl: { min: Math.round(minMl / fMax), max: Math.round(maxMl / fMin) },
    totalDailyMl: { min: minMl, max: maxMl },
    nightFeedsExpected: 'Varies by baby — newborns typically wake to feed at night',
    notes: [g.note, 'General guidance only — not medical advice. Always check with your pediatrician.'],
  };
}

// ---------------------------------------------------------------------------
// Firestore cache — lazy db import keeps this module side-effect free for tests.
// ---------------------------------------------------------------------------

async function getDb(): Promise<Firestore> {
  const { db } = await import('./firebase');
  return db;
}

const cacheRef = (db: Firestore, familyId: string, babyId: string) =>
  doc(db, 'families', familyId, 'babies', babyId, 'guidelines', 'current');

export async function readGuidelineCache(
  familyId: string,
  babyId: string,
): Promise<GuidelineCacheDoc | null> {
  try {
    const db = await getDb();
    const snap = await getDoc(cacheRef(db, familyId, babyId));
    if (!snap.exists()) return null;
    const d = snap.data() as Partial<GuidelineCacheDoc>;
    if (!d.payload || !d.ageBracket) return null;
    return d as GuidelineCacheDoc;
  } catch {
    return null;
  }
}

async function writeGuidelineCache(
  familyId: string,
  babyId: string,
  docData: GuidelineCacheDoc,
): Promise<void> {
  const db = await getDb();
  await setDoc(cacheRef(db, familyId, babyId), { ...docData, serverTs: serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Main entry points
// ---------------------------------------------------------------------------

export interface EnsureInput {
  familyId: string;
  babyId: string;
  birthdateIso: string;
  location?: string;
  forceRefresh?: boolean;
  provider?: GuidelineProvider; // injectable for tests / future providers
}

function defaultProvider(): GuidelineProvider | null {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.EXPO_PUBLIC_GUIDELINES_MODEL || 'gpt-4o-mini';
  return new OpenAIGuidelineProvider(apiKey, model);
}

async function generateWithRetry(
  provider: GuidelineProvider,
  input: { ageWeeks: number; ageBracket: string; location: string },
  attempts = 2,
): Promise<GuidelinePayload | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await provider.generate(input);
      const valid = validatePayload(raw);
      if (valid) return valid;
      // Invalid JSON shape → retry once, then fall through to static.
    } catch {
      // Network/model failure → retry once, then fall through to static.
    }
  }
  return null;
}

/**
 * Get the guidelines for a baby: cached LLM result when the age bracket
 * matches, a fresh LLM call when needed (or forced), else the static table.
 * Never throws — worst case returns the static fallback.
 */
export async function ensureGuidelines(input: EnsureInput): Promise<GuidelineState> {
  const months = ageInMonths(input.birthdateIso);
  const bracket = getAgeBracket(months);
  const ageWeeks = ageWeeksFromBirthdate(input.birthdateIso);
  const location = input.location?.trim() || 'unspecified region';

  try {
    if (!input.forceRefresh) {
      const cached = await readGuidelineCache(input.familyId, input.babyId);
      if (cached && cached.ageBracket === bracket) {
        return {
          source: 'cache',
          payload: cached.payload,
          ageBracket: bracket,
          location: cached.location,
          generatedAt: cached.generatedAt,
        };
      }
    }

    const provider = input.provider ?? defaultProvider();
    if (provider) {
      const payload = await generateWithRetry(provider, { ageWeeks, ageBracket: bracket, location });
      if (payload) {
        const cacheDoc: GuidelineCacheDoc = {
          generatedAt: Date.now(),
          ageWeeks,
          ageBracket: bracket,
          location,
          source: 'llm',
          provider: provider.name,
          payload,
        };
        try {
          await writeGuidelineCache(input.familyId, input.babyId, cacheDoc);
        } catch {
          // Cache write is best-effort; the payload is still returned.
        }
        return { source: 'llm', payload, ageBracket: bracket, location, generatedAt: cacheDoc.generatedAt };
      }
    }
  } catch {
    // Any unexpected failure → static fallback below.
  }

  return {
    source: 'static',
    payload: staticPayloadFor(input.birthdateIso),
    ageBracket: bracket,
    location,
    generatedAt: null,
  };
}
