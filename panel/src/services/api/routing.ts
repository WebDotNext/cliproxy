/**
 * Routing preview API: which Claude account a quota-aware strategy would pick
 * for a new session, computed by the backend's live selector.
 */

import { apiClient } from './client';

export const ROUTING_PREVIEW_TIERS = [
  'ranked',
  'unmeasured',
  'exhausted',
  'unobservable',
  'unavailable',
] as const;
export type RoutingPreviewTier = (typeof ROUTING_PREVIEW_TIERS)[number];

export const ROUTING_DECIDED_BY = [
  'unmeasured',
  'only_candidate',
  'weekly_reset',
  'burn_rate',
  'five_hour_reset',
  'unobservable',
  'all_exhausted',
  'none_available',
] as const;
export type RoutingDecidedBy = (typeof ROUTING_DECIDED_BY)[number];

export interface RoutingPreviewWindow {
  /** Share used, 0-1. */
  utilization: number;
  resetAtMs: number;
  rejected: boolean;
}

export interface RoutingPreviewCandidate {
  authId: string;
  name: string;
  email: string;
  tier: RoutingPreviewTier;
  /** 1-based position among ranked accounts; 0 when not ranked. */
  rank: number;
  fiveHour: RoutingPreviewWindow | null;
  weekly: RoutingPreviewWindow | null;
  /** Remaining weekly share (0-1) per hour until reset. */
  weeklyBurnRate: number;
}

export interface RoutingPreview {
  strategy: string;
  quotaAware: boolean;
  nextAuthId: string;
  decidedBy: RoutingDecidedBy | null;
  candidates: RoutingPreviewCandidate[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const toString = (value: unknown) => (typeof value === 'string' ? value : '');

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | null =>
  values.find((candidate) => candidate === value) ?? null;

const normalizeWindow = (raw: unknown): RoutingPreviewWindow | null => {
  if (!isRecord(raw)) return null;
  const resetAtMs = Date.parse(toString(raw.reset_at));
  if (Number.isNaN(resetAtMs)) return null;
  return { utilization: toNumber(raw.utilization), resetAtMs, rejected: raw.rejected === true };
};

export const normalizeRoutingPreview = (raw: unknown): RoutingPreview => {
  const data = isRecord(raw) ? raw : {};
  const candidates = Array.isArray(data.candidates) ? data.candidates.filter(isRecord) : [];
  return {
    strategy: toString(data.strategy),
    quotaAware: data.quota_aware === true,
    nextAuthId: toString(data.next_auth_id),
    decidedBy: oneOf(ROUTING_DECIDED_BY, data.decided_by),
    candidates: candidates.map((candidate) => ({
      authId: toString(candidate.auth_id),
      name: toString(candidate.name),
      email: toString(candidate.email),
      tier: oneOf(ROUTING_PREVIEW_TIERS, candidate.tier) ?? 'unavailable',
      rank: toNumber(candidate.rank),
      fiveHour: normalizeWindow(candidate.five_hour),
      weekly: normalizeWindow(candidate.weekly),
      weeklyBurnRate: toNumber(candidate.weekly_burn_rate),
    })),
  };
};

export const routingApi = {
  preview: async () => normalizeRoutingPreview(await apiClient.get<unknown>('/routing/preview')),
};
