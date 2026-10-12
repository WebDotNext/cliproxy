/**
 * Treats several accounts of one provider as a single pool: for each usage
 * window, how much is left across every account and who holds it. React-free
 * so it can be tested directly.
 */

/** Account colours for the pool bars. Green, amber and red stay reserved for status. */
export const POOL_COLORS = ['#6aa7ff', '#c792ea', '#4fd1c5', '#f2a65a', '#f78fb3', '#a3a8ff'];

export interface PoolWindowInput {
  id: string;
  label: string;
  usedPercent: number | null;
}

export interface PoolAccountInput {
  key: string;
  label: string;
  windows: readonly PoolWindowInput[];
}

export interface PoolSegment {
  key: string;
  label: string;
  color: string;
  /** Percent left on this account, 0 to 100. */
  remaining: number;
}

export interface PoolWindow {
  id: string;
  label: string;
  /** Sum of every account's percent left. */
  remaining: number;
  /** 100 per account that reports this window. */
  capacity: number;
  segments: PoolSegment[];
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export function poolColorMap(accounts: readonly { key: string }[]): Map<string, string> {
  return new Map(
    accounts.map((account, index) => [account.key, POOL_COLORS[index % POOL_COLORS.length]])
  );
}

export function buildQuotaPool(accounts: readonly PoolAccountInput[]): PoolWindow[] {
  const colors = poolColorMap(accounts);
  const windows = new Map<string, PoolWindow>();

  for (const account of accounts) {
    for (const window of account.windows) {
      if (window.usedPercent === null) continue;
      const pooled = windows.get(window.id) ?? {
        id: window.id,
        label: window.label,
        remaining: 0,
        capacity: 0,
        segments: [],
      };
      const remaining = clampPercent(100 - window.usedPercent);
      pooled.remaining += remaining;
      pooled.capacity += 100;
      pooled.segments.push({
        key: account.key,
        label: account.label,
        color: colors.get(account.key) ?? POOL_COLORS[0],
        remaining,
      });
      windows.set(window.id, pooled);
    }
  }

  return [...windows.values()];
}
