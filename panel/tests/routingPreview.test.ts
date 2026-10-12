import { describe, expect, test } from 'bun:test';
import { normalizeRoutingPreview } from '../src/services/api/routing';
import { explainRouting } from '../src/features/quota/routingExplanation';

const window = (utilization: number, resetAt: string) => ({ utilization, reset_at: resetAt });

// Shape returned by GET /v8/management/routing/preview.
const tieResponse = {
  strategy: 'burn-rate',
  quota_aware: true,
  next_auth_id: 'idexx.json',
  decided_by: 'five_hour_reset',
  candidates: [
    {
      auth_id: 'spent.json',
      name: 'spent.json',
      tier: 'exhausted',
      five_hour: window(1, '2026-10-09T09:00:00Z'),
      weekly: window(0.5, '2026-10-10T09:00:00Z'),
    },
    {
      auth_id: 'ezyvet.json',
      name: 'ezyvet.json',
      email: 'b@ezyvet.com',
      tier: 'ranked',
      rank: 2,
      five_hour: window(0, '2026-10-09T23:40:00Z'),
      weekly: window(0, '2026-10-13T03:00:00Z'),
      weekly_burn_rate: 0.0097,
    },
    {
      auth_id: 'idexx.json',
      name: 'idexx.json',
      email: 'a@idexx.com',
      tier: 'ranked',
      rank: 1,
      five_hour: window(0.19, '2026-10-09T22:00:00Z'),
      weekly: window(0.44, '2026-10-11T07:00:00Z'),
      weekly_burn_rate: 0.0095,
    },
  ],
};

describe('routing preview', () => {
  test('normalizes backend fields and tolerates unknown values', () => {
    const preview = normalizeRoutingPreview({
      ...tieResponse,
      decided_by: 'something_new',
      candidates: [{ auth_id: 'x', tier: 'mystery', weekly: { reset_at: 'not a date' } }],
    });
    expect(preview.decidedBy).toBeNull();
    expect(preview.candidates[0]).toMatchObject({ authId: 'x', tier: 'unavailable', weekly: null });
    expect(normalizeRoutingPreview(null)).toMatchObject({ quotaAware: false, candidates: [] });
  });

  test('explains a burn-rate tie with the 5-hour reset', () => {
    const explanation = explainRouting(normalizeRoutingPreview(tieResponse));
    expect(explanation.next?.authId).toBe('idexx.json');
    expect(explanation.summary.key).toBe('why_burn_rate_tie');
    expect(explanation.summary.params).toMatchObject({
      next: 'a@idexx.com',
      other: 'b@ezyvet.com',
      rate: '0.95',
      otherRate: '0.97',
    });
    expect(explanation.rows.map((row) => row.authId)).toEqual([
      'idexx.json',
      'ezyvet.json',
      'spent.json',
    ]);
    expect(explanation.steps.map((step) => step.key)).toEqual([
      'step_eligible',
      'step_exhausted',
      'step_rate',
      'step_rate',
      'why_burn_rate_tie',
      'step_affinity',
    ]);
  });

  test('explains probing of unmeasured accounts without a single pick', () => {
    const explanation = explainRouting(
      normalizeRoutingPreview({
        strategy: 'soonest-reset',
        quota_aware: true,
        decided_by: 'unmeasured',
        candidates: [
          { auth_id: 'a', email: 'a@x.com', tier: 'unmeasured' },
          { auth_id: 'b', email: 'b@x.com', tier: 'unmeasured' },
        ],
      })
    );
    expect(explanation.next).toBeNull();
    expect(explanation.summary).toEqual({
      key: 'why_unmeasured',
      params: { accounts: 'a@x.com, b@x.com' },
    });
  });
});
