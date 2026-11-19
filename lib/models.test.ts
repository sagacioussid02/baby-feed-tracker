/**
 * models.test.ts — unit tests for the central model registry (lib/models.ts)
 * and for the env flip flowing end-to-end into the one LLM call site
 * (OpenAIGuidelineProvider in lib/llmGuidelines.ts).
 *
 * The defaults MUST preserve current behavior exactly: 'guidelines' stays
 * gpt-4o-mini unless EXPO_PUBLIC_GUIDELINES_MODEL says otherwise.
 */

import { REGISTRY, defaultModel, modelEnvVar, resolveModel } from './models';
import { OpenAIGuidelineProvider, defaultProvider } from './llmGuidelines';

const MODEL_VAR = 'EXPO_PUBLIC_GUIDELINES_MODEL';
const KEY_VAR = 'EXPO_PUBLIC_OPENAI_API_KEY';

describe('registry defaults', () => {
  test('one role: guidelines, OpenAI, gpt-4o-mini — the model used today', () => {
    expect(Object.keys(REGISTRY)).toEqual(['guidelines']);
    expect(REGISTRY.guidelines).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(defaultModel('guidelines')).toBe('gpt-4o-mini');
  });

  test('env var name keeps the EXPO_PUBLIC_ prefix (client-bundled var)', () => {
    expect(modelEnvVar('guidelines')).toBe('EXPO_PUBLIC_GUIDELINES_MODEL');
  });
});

describe('resolveModel', () => {
  test('no env var → registry default', () => {
    expect(resolveModel('guidelines', {})).toBe('gpt-4o-mini');
  });

  test('env override wins without code changes', () => {
    expect(resolveModel('guidelines', { [MODEL_VAR]: 'gpt-4o' })).toBe('gpt-4o');
  });

  test('blank / whitespace-only env value counts as unset', () => {
    expect(resolveModel('guidelines', { [MODEL_VAR]: '' })).toBe('gpt-4o-mini');
    expect(resolveModel('guidelines', { [MODEL_VAR]: '   ' })).toBe('gpt-4o-mini');
  });

  test('surrounding whitespace is trimmed', () => {
    expect(resolveModel('guidelines', { [MODEL_VAR]: '  gpt-4o  ' })).toBe('gpt-4o');
  });
});

describe('env flip end-to-end through the call site', () => {
  const validPayload = {
    feedsPerDay: { min: 6, max: 8 },
    amountPerFeedMl: { min: 90, max: 150 },
    totalDailyMl: { min: 700, max: 950 },
    nightFeedsExpected: '2-3 night feeds typical',
    notes: ['General guidance only. Consult your pediatrician.'],
  };

  let savedModelVar: string | undefined;
  let savedKeyVar: string | undefined;
  let fetchMock: jest.Mock;
  let lastBody: Record<string, unknown>;

  beforeEach(() => {
    savedModelVar = process.env[MODEL_VAR];
    savedKeyVar = process.env[KEY_VAR];
    lastBody = {};
    fetchMock = jest.fn(async (_url: string, init: { body?: string }) => {
      lastBody = JSON.parse(init.body ?? '{}') as Record<string, unknown>;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(validPayload) } }],
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (savedModelVar === undefined) delete process.env[MODEL_VAR];
    else process.env[MODEL_VAR] = savedModelVar;
    if (savedKeyVar === undefined) delete process.env[KEY_VAR];
    else process.env[KEY_VAR] = savedKeyVar;
    jest.restoreAllMocks();
  });

  test('no override → the request uses gpt-4o-mini', async () => {
    delete process.env[MODEL_VAR];
    process.env[KEY_VAR] = 'test-key';
    const provider = defaultProvider();
    expect(provider).not.toBeNull();
    await provider!.generate({ ageWeeks: 8, ageBracket: '1-3m', location: 'United States' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody.model).toBe('gpt-4o-mini');
  });

  test('EXPO_PUBLIC_GUIDELINES_MODEL flips the model actually sent', async () => {
    process.env[MODEL_VAR] = 'gpt-4o';
    process.env[KEY_VAR] = 'test-key';
    const provider = defaultProvider();
    expect(provider).not.toBeNull();
    await provider!.generate({ ageWeeks: 8, ageBracket: '1-3m', location: 'United States' });
    expect(lastBody.model).toBe('gpt-4o');
  });

  test('blank override → default model is sent', async () => {
    process.env[MODEL_VAR] = '   ';
    process.env[KEY_VAR] = 'test-key';
    const provider = defaultProvider();
    await provider!.generate({ ageWeeks: 8, ageBracket: '1-3m', location: 'United States' });
    expect(lastBody.model).toBe('gpt-4o-mini');
  });

  test('no API key → no provider (unchanged behavior)', () => {
    delete process.env[KEY_VAR];
    expect(defaultProvider()).toBeNull();
  });

  test('provider constructor default still resolves from the registry', async () => {
    const provider = new OpenAIGuidelineProvider('test-key');
    await provider.generate({ ageWeeks: 8, ageBracket: '1-3m', location: 'United States' });
    expect(lastBody.model).toBe('gpt-4o-mini');
  });
});
