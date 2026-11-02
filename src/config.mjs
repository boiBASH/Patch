import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));

export function loadConfig(env = process.env, loadFile = true) {
  const envFile = path.join(ROOT, '.env');
  if (loadFile && env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535.');
  const model = (env.AI_MODEL || env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini').trim();
  if (!/^[a-zA-Z0-9._:/~-]{1,180}$/.test(model)) throw new Error('AI_MODEL must be a model ID.');
  return { port, model, apiKey: (env.AI_API_KEY || env.OPENROUTER_API_KEY || '').trim(), dataDir: path.join(ROOT, 'data', 'runs') };
}
