import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

// Only used outside production so local runs and tests work without extra setup.
const DEVELOPMENT_IP_HASH_SECRET = 'development-only-ip-hash-secret-not-for-production';

/** A Postgres connection URL. */
export const databaseUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

const usd = z.coerce.number().nonnegative();
const count = z.coerce.number().int().positive();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: databaseUrlSchema,
    // The integration/e2e test database; only the test tooling reads it.
    TEST_DATABASE_URL: databaseUrlSchema.optional(),
    IP_HASH_SECRET: z.string().min(32).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    COMMIT: z.string().min(1).default('unknown'),
    // `fake` (scripted, no key, no cost) everywhere except where real answers are wanted.
    LLM_MODE: z.enum(['fake', 'real']).default('fake'),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    // Tokens a Notebook's enabled Sources may add up to (ADR 0002).
    SOURCE_TOKEN_CAP: z.coerce.number().int().positive().default(80_000),
    // Only read to refuse it in production: the subscription login must never pay for the demo.
    CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1).optional(),
    // Budget guard: Demo budget (Berlin day and in total), Daily allowance per Visitor.
    DEMO_BUDGET_DAILY_USD: usd.default(2),
    DEMO_BUDGET_TOTAL_USD: usd.default(13),
    DAILY_ALLOWANCE_USD: usd.default(0.5),
    CHAT_RATE_LIMIT_PER_HOUR: count.default(30),
    AGENT_RATE_LIMIT_PER_HOUR: count.default(3),
    BRIEFING_RATE_LIMIT_PER_HOUR: count.default(3),
    // What a Chat answer or a Briefing holds against the caps while it runs, before its real
    // cost is known (an Agent run holds AGENT_MAX_BUDGET_USD).
    CHAT_HOLD_USD: usd.default(0.02),
    BRIEFING_HOLD_USD: usd.default(0.2),
    // Agent runs at the same time, across the whole demo.
    AGENT_CONCURRENCY_LIMIT: count.default(2),
    NEW_VISITORS_PER_IP_PER_DAY: count.default(5),
    // Tests only: lets the guarded URL fetcher reach 127.0.0.1 on this one port,
    // where the integration and e2e fixtures serve their pages.
    URL_FETCH_TEST_LOOPBACK_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
    // Agent run caps: model turns, spend, wall-clock time, Notes written, web searches,
    // web pages read and Sources added per run.
    AGENT_MAX_TURNS: count.default(15),
    AGENT_MAX_BUDGET_USD: z.coerce.number().positive().default(0.3),
    AGENT_TIMEOUT_SECONDS: count.default(180),
    AGENT_MAX_NOTES: count.default(2),
    AGENT_MAX_WEB_SEARCHES: count.default(3),
    AGENT_MAX_PAGE_READS: count.default(5),
    AGENT_MAX_SOURCES_ADDED: count.default(2),
  })
  .transform((env, ctx) => {
    if (env.IP_HASH_SECRET === undefined && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['IP_HASH_SECRET'],
        message: 'IP_HASH_SECRET is required in production',
      });
      return z.NEVER;
    }
    if (env.CLAUDE_CODE_OAUTH_TOKEN !== undefined && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['CLAUDE_CODE_OAUTH_TOKEN'],
        message: 'CLAUDE_CODE_OAUTH_TOKEN must not be set in production',
      });
      return z.NEVER;
    }
    if (env.LLM_MODE === 'real' && env.ANTHROPIC_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LLM_MODE=real',
      });
      return z.NEVER;
    }
    if (env.URL_FETCH_TEST_LOOPBACK_PORT !== undefined && env.LLM_MODE === 'real') {
      ctx.addIssue({
        code: 'custom',
        path: ['URL_FETCH_TEST_LOOPBACK_PORT'],
        message: 'URL_FETCH_TEST_LOOPBACK_PORT is for tests and not allowed with LLM_MODE=real',
      });
      return z.NEVER;
    }
    return { ...env, IP_HASH_SECRET: env.IP_HASH_SECRET ?? DEVELOPMENT_IP_HASH_SECRET };
  });

export type Env = z.infer<typeof envSchema>;

/** Parses the environment; throws a readable error listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Empty strings (e.g. `COMMIT=` in an .env file) mean "not set".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** The validated environment of this process, parsed once. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
