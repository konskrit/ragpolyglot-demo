import { readFileSync } from 'fs';
import { join } from 'path';

const cache = new Map<string, string>();

export function loadSql(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;

  const sql = readFileSync(join(__dirname, 'assets', 'sql', name), 'utf8');
  cache.set(name, sql);
  return sql;
}
