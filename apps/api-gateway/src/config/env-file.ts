import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

/** How far to walk up from cwd when looking for a repo-root `.env`. */
const ENV_FILE_SEARCH_MAX_DEPTH = 8;

/** Parse KEY=VALUE assignments; ignores comments/blank lines. */
export function parseEnvAssignments(content: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    out.set(key, stripQuotes(line.slice(eq + 1).trim()));
  }
  return out;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function formatEnvValue(value: string): string {
  if (value === '') return '';
  if (/[\s#"']/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return value;
}

/**
 * Update allowlisted keys in .env text. Preserves comments and unknown keys.
 * Missing keys are appended at the end.
 */
export function mergeEnvFile(
  content: string,
  updates: ReadonlyMap<string, string>,
): string {
  if (updates.size === 0) return content;

  const remaining = new Map(updates);
  const nl = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.length === 0 ? [] : content.split(/\r?\n/);
  const out: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      out.push(rawLine);
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      out.push(rawLine);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    const value = remaining.get(key);
    if (value === undefined) {
      out.push(rawLine);
      continue;
    }
    remaining.delete(key);
    out.push(`${key}=${formatEnvValue(value)}`);
  }

  if (remaining.size > 0) {
    if (out.length > 0 && out[out.length - 1] !== '') {
      out.push('');
    }
    out.push('# Updated via /api/config');
    for (const [key, value] of remaining) {
      out.push(`${key}=${formatEnvValue(value)}`);
    }
  }

  let result = out.join(nl);
  if (content.endsWith('\n') || content.endsWith('\r\n')) {
    if (!result.endsWith(nl)) result += nl;
  }
  return result;
}

export function findRootEnvFile(startDir: string): string | null {
  let dir = resolve(startDir);
  for (let i = 0; i < ENV_FILE_SEARCH_MAX_DEPTH; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveEnvFilePath(): string {
  const fromEnv = process.env.ENV_FILE_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);
  const found = findRootEnvFile(process.cwd());
  if (!found) {
    throw new Error(
      'ENV_FILE_PATH is unset and no .env was found from process.cwd()',
    );
  }
  return found;
}

export function readEnvFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`env file not found: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

export function writeEnvFile(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}
