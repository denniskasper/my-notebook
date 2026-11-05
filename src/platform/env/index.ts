import { z } from 'zod';

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

// Only used outside production so local runs and tests work without extra setup.
const DEVELOPMENT_IP_HASH_SECRET = 'development-only-ip-hash-secret-not-for-production';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    IP_HASH_SECRET: z.string().min(32).optional(),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    COMMIT: z.string().min(1).default('unknown'),
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
