/**
 * Turns a backend routing preview into i18n-ready sentences. React-free so it
 * can be tested directly; the component only translates and renders.
 */

import type { RoutingPreview, RoutingPreviewCandidate } from '@/services/api/routing';
import { formatInstantShort } from '@/utils/quota';

export type RoutingSentence = {
  /** Key under `quota_management.routing.`. */
  key: string;
  params?: Record<string, string>;
};

export type RoutingExplanation = {
  next: RoutingPreviewCandidate | null;
  /** One-line answer shown next to the pick. */
  summary: RoutingSentence;
  /** The rule applied in order, for the "Why" panel. */
  steps: RoutingSentence[];
  /** Ranked accounts best first, then everyone else. */
  rows: RoutingPreviewCandidate[];
};

export const accountLabel = (candidate: RoutingPreviewCandidate) =>
  candidate.email || candidate.name;

export const formatBurnRate = (rate: number) => (rate * 100).toFixed(2);

const percent = (share: number) => `${Math.round(share * 100)}`;

const listLabels = (candidates: RoutingPreviewCandidate[]) =>
  candidates.map(accountLabel).join(', ');

export function explainRouting(preview: RoutingPreview): RoutingExplanation {
  const ranked = preview.candidates
    .filter((candidate) => candidate.tier === 'ranked')
    .sort((a, b) => a.rank - b.rank);
  const others = preview.candidates.filter((candidate) => candidate.tier !== 'ranked');
  const byTier = (tier: RoutingPreviewCandidate['tier']) =>
    preview.candidates.filter((candidate) => candidate.tier === tier);

  const next =
    preview.candidates.find((candidate) => candidate.authId === preview.nextAuthId) ?? null;
  const [first, second] = ranked;
  const steps: RoutingSentence[] = [];

  const exhausted = byTier('exhausted');
  const unmeasured = byTier('unmeasured');
  if (ranked.length > 0) {
    steps.push({ key: 'step_eligible', params: { accounts: listLabels(ranked) } });
  }
  if (exhausted.length > 0) {
    steps.push({ key: 'step_exhausted', params: { accounts: listLabels(exhausted) } });
  }

  let summary: RoutingSentence;
  switch (preview.decidedBy) {
    case 'unmeasured':
      summary = { key: 'why_unmeasured', params: { accounts: listLabels(unmeasured) } };
      break;
    case 'only_candidate':
      summary = { key: 'why_only_candidate', params: { next: next ? accountLabel(next) : '' } };
      break;
    case 'weekly_reset':
      summary = {
        key: 'why_weekly_reset',
        params: {
          next: accountLabel(first),
          reset: formatInstantShort(first.weekly?.resetAtMs ?? 0),
          other: accountLabel(second),
          otherReset: formatInstantShort(second.weekly?.resetAtMs ?? 0),
        },
      };
      break;
    case 'burn_rate':
      summary = {
        key: 'why_burn_rate',
        params: {
          next: accountLabel(first),
          rate: formatBurnRate(first.weeklyBurnRate),
          other: accountLabel(second),
          otherRate: formatBurnRate(second.weeklyBurnRate),
        },
      };
      break;
    case 'five_hour_reset':
      summary = {
        key: preview.strategy === 'burn-rate' ? 'why_burn_rate_tie' : 'why_weekly_tie',
        params: {
          next: accountLabel(first),
          rate: formatBurnRate(first.weeklyBurnRate),
          reset: formatInstantShort(first.fiveHour?.resetAtMs ?? 0),
          other: accountLabel(second),
          otherRate: formatBurnRate(second.weeklyBurnRate),
          otherReset: formatInstantShort(second.fiveHour?.resetAtMs ?? 0),
        },
      };
      break;
    case 'unobservable':
      summary = { key: 'why_unobservable' };
      break;
    case 'all_exhausted':
      summary = { key: 'why_all_exhausted' };
      break;
    default:
      summary = { key: 'why_none_available' };
  }

  if (preview.strategy === 'burn-rate' && ranked.length > 1) {
    for (const candidate of ranked) {
      steps.push({
        key: 'step_rate',
        params: {
          account: accountLabel(candidate),
          left: percent(1 - (candidate.weekly?.utilization ?? 0)),
          reset: formatInstantShort(candidate.weekly?.resetAtMs ?? 0),
          rate: formatBurnRate(candidate.weeklyBurnRate),
        },
      });
    }
  }
  steps.push(summary, { key: 'step_affinity' });

  return { next, summary, steps, rows: [...ranked, ...others] };
}
