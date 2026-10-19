/**
 * guidelines.ts — general pediatric intake guidance.
 *
 * These are widely-published, aggregate ranges, provided for quick
 * reference only. They are NOT medical advice: every baby is different,
 * and the pediatrician's guidance for your child always takes precedence.
 */

export interface IntakeGuideline {
  bracketLabel: string;
  minOzPerDay: number;
  maxOzPerDay: number;
  /** Typical number of milk feeds per day, [min, max]. */
  typicalFeedsPerDay: [number, number];
  note: string;
}

export const MEDICAL_DISCLAIMER =
  'General guidance only — not medical advice. Always check with your pediatrician.';

export const OZ_TO_ML = 29.5735;

export function ozToMl(oz: number): number {
  return oz * OZ_TO_ML;
}

export function mlToOz(ml: number): number {
  return ml / OZ_TO_ML;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whole completed months between a birthdate and now.
 * Returns a negative number for future birthdates (callers should reject those).
 */
export function ageInMonths(birthdateIso: string, nowMs: number = Date.now()): number {
  const birth = Date.parse(birthdateIso);
  if (Number.isNaN(birth)) {
    return NaN;
  }
  const now = new Date(nowMs);
  const then = new Date(birth);

  let months = (now.getUTCFullYear() - then.getUTCFullYear()) * 12
    + (now.getUTCMonth() - then.getUTCMonth());

  // If the calendar day of the month hasn't been reached yet, the current
  // month isn't complete.
  if (now.getUTCDate() < then.getUTCDate()) {
    months -= 1;
  }
  return months;
}

/**
 * Return the intake guideline bracket for the given age in months,
 * or null when the age is out of range (negative, NaN, or ≥ 12).
 *
 * Brackets (widely-published ranges):
 *   0–1 month:   ~18–32 oz/day, 8–12 feeds/day (small, frequent feeds)
 *   1–6 months:  24–32 oz/day, 6–8 feeds/day
 *   6–12 months: 24–32 oz/day with solids introduced (milk still primary),
 *                 4–6 milk feeds/day
 */
export function getGuideline(ageMonths: number): IntakeGuideline | null {
  if (Number.isNaN(ageMonths) || ageMonths < 0 || ageMonths >= 12) {
    return null;
  }
  if (ageMonths < 1) {
    return {
      bracketLabel: '0–1 month',
      minOzPerDay: 18,
      maxOzPerDay: 32,
      typicalFeedsPerDay: [8, 12],
      note: 'Newborns eat little and often — small, frequent feeds are normal.',
    };
  }
  if (ageMonths < 6) {
    return {
      bracketLabel: '1–6 months',
      minOzPerDay: 24,
      maxOzPerDay: 32,
      typicalFeedsPerDay: [6, 8],
      note: 'Feed volumes grow as stomach capacity increases; follow hunger cues.',
    };
  }
  return {
    bracketLabel: '6–12 months',
    minOzPerDay: 24,
    maxOzPerDay: 32,
    typicalFeedsPerDay: [4, 6],
    note: 'Solids are introduced around 6 months, but milk remains the primary nutrition source through the first year.',
  };
}

/**
 * Human-friendly age label: "5 days old" | "3 weeks old" | "4 months old".
 *
 * Bands (whole units, floored):
 *   < 14 days  → days
 *   < 60 days  → weeks
 *   otherwise  → months
 */
export function formatAge(birthdateIso: string, nowMs: number = Date.now()): string {
  const birth = Date.parse(birthdateIso);
  if (Number.isNaN(birth)) {
    return 'unknown age';
  }
  const days = Math.floor((nowMs - birth) / DAY_MS);
  if (days < 0) {
    return 'not born yet';
  }
  if (days < 14) {
    return `${days} days old`;
  }
  if (days < 60) {
    return `${Math.floor(days / 7)} weeks old`;
  }
  const months = ageInMonths(birthdateIso, nowMs);
  return `${months} months old`;
}
