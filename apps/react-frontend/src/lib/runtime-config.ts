import type { RuntimeConfigSetting } from '@ragpolyglot-shared';

export function dirtyValues(
  draft: Record<string, string>,
  saved: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (saved[key] !== value) out[key] = value;
  }
  return out;
}

export function groupByServices(
  settings: RuntimeConfigSetting[],
): { label: string; settings: RuntimeConfigSetting[] }[] {
  const groups = new Map<string, RuntimeConfigSetting[]>();
  for (const setting of settings) {
    const label = [...setting.services].sort().join(' + ');
    const list = groups.get(label);
    if (list) list.push(setting);
    else groups.set(label, [setting]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, settings: items }));
}
