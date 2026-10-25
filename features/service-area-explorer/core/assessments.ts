import type { FitAssessment, FitTier, Opportunity, ProfileRevision } from './contract';
import { sameRevision } from './revisions';

/** Displayed fit labels (SRS D-11). */
export const FIT_LABELS: Readonly<Record<FitTier, string>> = {
  good_fit: 'Good fit',
  possible_fit: 'Possible fit',
  not_a_fit: 'Not a fit',
  needs_review: 'Needs review',
};

/** What the explorer may say about fit. Unassessed is a state, never a tier (SRS §11.3). */
export type FitDisplay =
  | { kind: 'assessed'; tier: FitTier; label: string }
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | { kind: 'not_assessed' };

const NOT_ASSESSED: FitDisplay = { kind: 'not_assessed' };

/** Accepts `good_fit`, `Good fit` or `good-fit` while B finalizes the enum spelling. */
export function normalizeFitTier(value: unknown): FitTier | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return Object.hasOwn(FIT_LABELS, key) ? (key as FitTier) : null;
}

/**
 * Indexes the assessments that belong to the active profile revision. Older
 * revisions and assessments of an outdated opportunity version are dropped, so
 * a late response can never relabel newer results (SRS REC-07).
 */
export function indexCurrentAssessments(
  assessments: readonly FitAssessment[],
  revision: ProfileRevision,
  opportunities: readonly Pick<Opportunity, 'id' | 'version'>[] = [],
): ReadonlyMap<string, FitDisplay> {
  const versions = new Map(opportunities.map((o) => [o.id, o.version]));
  const index = new Map<string, FitDisplay>();
  for (const assessment of assessments) {
    if (!sameRevision(assessment.profileRevision, revision)) continue;
    if (index.has(assessment.opportunityId)) continue;
    const current = versions.get(assessment.opportunityId);
    if (current != null && assessment.opportunityVersion != null && String(current) !== String(assessment.opportunityVersion)) {
      continue;
    }
    index.set(assessment.opportunityId, toDisplay(assessment));
  }
  return index;
}

function toDisplay(assessment: FitAssessment): FitDisplay {
  if (assessment.state === 'pending') return { kind: 'pending' };
  if (assessment.state !== 'assessed') return { kind: 'unavailable' };
  const tier = normalizeFitTier(assessment.tier);
  // An "assessed" record without a recognizable tier is not evidence of any tier.
  return tier ? { kind: 'assessed', tier, label: FIT_LABELS[tier] } : { kind: 'unavailable' };
}

export function fitFor(index: ReadonlyMap<string, FitDisplay>, opportunityId: string): FitDisplay {
  return index.get(opportunityId) ?? NOT_ASSESSED;
}

/** Counts assessed tiers among a set of opportunities; everything else is `unassessed`. */
export function tallyFit(index: ReadonlyMap<string, FitDisplay>, opportunityIds: readonly string[]) {
  const counts: Record<FitTier | 'unassessed', number> = {
    good_fit: 0,
    possible_fit: 0,
    needs_review: 0,
    not_a_fit: 0,
    unassessed: 0,
  };
  for (const id of opportunityIds) {
    const fit = fitFor(index, id);
    counts[fit.kind === 'assessed' ? fit.tier : 'unassessed'] += 1;
  }
  return counts;
}
