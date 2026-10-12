import { expect, test } from 'bun:test';
import { POOL_COLORS, buildQuotaPool } from '../src/features/quota/quotaPool';

test('pools what is left per window and keeps each account in its own colour', () => {
  const pool = buildQuotaPool([
    {
      key: 'ezyvet',
      label: 'ezyvet',
      windows: [
        { id: 'five-hour', label: '5-hour', usedPercent: 0 },
        { id: 'seven-day', label: '7-day', usedPercent: 0 },
      ],
    },
    {
      key: 'idexx',
      label: 'idexx',
      windows: [
        { id: 'five-hour', label: '5-hour', usedPercent: null },
        { id: 'seven-day', label: '7-day', usedPercent: 44 },
        { id: 'seven-day-fable', label: 'Fable', usedPercent: 130 },
      ],
    },
  ]);

  expect(pool.map((window) => [window.id, window.remaining, window.capacity])).toEqual([
    // A window an account can't measure adds nothing to the pool's capacity.
    ['five-hour', 100, 100],
    ['seven-day', 156, 200],
    // Over-limit usage clamps to nothing left.
    ['seven-day-fable', 0, 100],
  ]);
  expect(pool[1].segments.map((segment) => segment.color)).toEqual([
    POOL_COLORS[0],
    POOL_COLORS[1],
  ]);
  expect(pool[2].segments[0].color).toBe(POOL_COLORS[1]);
});
