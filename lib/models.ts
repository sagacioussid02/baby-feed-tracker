/**
 * models.ts — central model registry for the baby milk tracker.
 *
 * ONE role, ONE call site: the guideline generator in lib/llmGuidelines.ts
 * (OpenAIGuidelineProvider) is the project's only LLM call site — the
 * rolling-average prediction engine (predict.ts) is deterministic and local,
 * and there is no Firebase Functions backend in this repo.
 *
 * Every model string the app uses lives here, as ROLE -> provider + model ID.
 * To change which model a job uses, edit the default below or set the
 * per-role environment variable — no code changes, no new provider SDKs.
 *
 * Defaults MUST preserve current behavior exactly: the default for each role
 * is the model that call site uses today. This is a refactor, not a model
 * swap.
 *
 * Env override naming: the variable keeps the EXPO_PUBLIC_ prefix because
 * Expo only bakes EXPO_PUBLIC_* variables into the client bundle — a plain
 * MODEL_GUIDELINES would never reach the app at runtime.
 */

export type ModelRole = 'guidelines';

export interface ModelSpec {
  /** Provider name, e.g. 'openai'. Matches GuidelineProvider.name. */
  readonly provider: string;
  /** Provider model ID, e.g. 'gpt-4o-mini'. */
  readonly model: string;
}

/**
 * Role -> provider + model ID. 'guidelines' seeds the one-time per-baby
 * feeding-guideline call (age + location only, cached in Firestore).
 */
export const REGISTRY: Record<ModelRole, ModelSpec> = {
  guidelines: { provider: 'openai', model: 'gpt-4o-mini' },
};

/** Environment variable that overrides a role's model, if set. */
export function modelEnvVar(role: ModelRole): string {
  switch (role) {
    case 'guidelines':
      return 'EXPO_PUBLIC_GUIDELINES_MODEL';
  }
}

/** The registry default for a role — the model the call site uses today. */
export function defaultModel(role: ModelRole): string {
  return REGISTRY[role].model;
}

/**
 * Resolve the model for a role: a non-blank env override wins, otherwise
 * the registry default. A blank/whitespace-only value counts as unset.
 */
export function resolveModel(
  role: ModelRole,
  env: Record<string, string | undefined> = process.env,
): string {
  const override = env[modelEnvVar(role)]?.trim();
  return override ? override : REGISTRY[role].model;
}
