import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, 'must start with postgres:// or postgresql://'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});
export type Config = z.infer<typeof Env>;

/** Reads settings from the environment and refuses to start on a bad value. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse(env);
  if (!result.success) throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  return result.data;
}
