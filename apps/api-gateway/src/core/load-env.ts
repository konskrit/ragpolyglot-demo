import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

/** How far to walk up from cwd when looking for a repo-root `.env`. */
const ENV_FILE_SEARCH_MAX_DEPTH = 8;

export function loadRootEnv(): void {
  const envPath = findRootEnv(process.cwd());
  if (!envPath) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function findRootEnv(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < ENV_FILE_SEARCH_MAX_DEPTH; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

loadRootEnv();
