import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

// Only used outside production so local runs and tests work without extra setup.
const DEVELOPMENT_IP_HASH_SECRET = 'development-only-ip-hash-secret-not-for-production';

/** A Postgres connection URL. */
export const databaseUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

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
    if (env.LLM_MODE === 'real' && env.ANTHROPIC_API_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'ANTHROPIC_API_KEY is required when LLM_MODE=real',
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
