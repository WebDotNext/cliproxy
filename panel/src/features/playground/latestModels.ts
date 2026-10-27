/**
 * Narrows the proxy's model list for the playground picker. The proxy only lists
 * models backed by a logged-in account, so every provider shown here is usable.
 * Claude keeps just the newest model per family, so a new release replaces the
 * old one without a code change; other providers are listed as-is.
 */

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

// Undated ids only, e.g. claude-opus-5-5 or claude-fable-5; dated snapshots are skipped.
const MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d))?$/;

export const sortModels = (ids: readonly string[]) =>
  [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

export function latestModels(ids: readonly string[]): string[] {
  const newest = new Map<string, { id: string; version: number }>();
  const others: string[] = [];
  for (const id of ids) {
    if (id.startsWith('claude-')) {
      const match = MODEL_ID.exec(id);
      if (!match) continue;
      const [, family, major, minor = '0'] = match;
      const version = Number(major) * 100 + Number(minor);
      if ((newest.get(family)?.version ?? -1) < version) newest.set(family, { id, version });
    } else {
      others.push(id);
    }
  }
  return [...FAMILIES.flatMap((family) => newest.get(family)?.id ?? []), ...sortModels(others)];
}
