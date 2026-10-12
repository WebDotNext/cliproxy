/**
 * Narrows the proxy's model catalog to the newest Claude model in each family,
 * so a new release replaces the old one without a code change.
 */

const FAMILIES = ['opus', 'sonnet', 'haiku', 'fable'] as const;

// Undated ids only, e.g. claude-opus-5-5 or claude-fable-5; dated snapshots are skipped.
const MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d))?$/;

export function latestClaudeModels(ids: readonly string[]): string[] {
  const newest = new Map<string, { id: string; version: number }>();
  for (const id of ids) {
    const match = MODEL_ID.exec(id);
    if (!match) continue;
    const [, family, major, minor = '0'] = match;
    const version = Number(major) * 100 + Number(minor);
    if ((newest.get(family)?.version ?? -1) < version) newest.set(family, { id, version });
  }
  return FAMILIES.flatMap((family) => newest.get(family)?.id ?? []);
}
