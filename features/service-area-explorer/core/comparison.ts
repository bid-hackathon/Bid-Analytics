import type { Opportunity } from './contract';
import { WASHINGTON_COUNTY_NAMES } from './counties';
import type { WashingtonCountyName } from './counties';
import { isIncluded, resolveScope } from './geography';
import type { InclusionPolicy, OpportunityScope, UnknownLocationReason } from './geography';
import { isEmptySelection, isSelection, selectedCounties, selectionFromProfile } from './serviceArea';
import type { ProfileServiceArea, ServiceAreaSelection } from './serviceArea';

/** An opportunity as the explorer lists it; `agencyName` is resolved by the parent. */
export interface ExplorerOpportunity extends Opportunity {
  agencyName?: string | null;
}

/** How one service area partitions the catalog. The six partition counts sum to `catalogSize`. */
export interface AreaTally {
  included: number;
  includedByCounty: number;
  includedStatewide: number;
  /** Included only through counties taken from the agency's jurisdiction. */
  includedAgencyDerived: number;
  outside: number;
  /** Outside on every resolved site, but other sites have no known county. */
  outsideWithUnresolvedSites: number;
  statewideNotIncluded: number;
  remote: number;
  unknown: number;
}

export interface OpportunityChange {
  opportunity: ExplorerOpportunity;
  scope: OpportunityScope;
  /** Counties whose addition or removal causes the change; empty for statewide work. */
  viaCounties: readonly WashingtonCountyName[];
}

export interface CountyStat {
  /** Unique opportunities with a resolved site in this county. */
  total: number;
  /** Opportunities the draft would gain by adding this county (0 if already selected). */
  gainIfAdded: number;
  /** Opportunities the draft would lose by removing this county (0 if not selected). */
  lossIfRemoved: number;
}

export interface ServiceAreaComparison {
  /** Unique opportunities considered, after removing repeated IDs. */
  catalogSize: number;
  duplicateIdsIgnored: number;
  /** False when the confirmed area is a radius or drawn shape; `before` then counts as empty. */
  baselineComparable: boolean;
  before: AreaTally;
  after: AreaTally;
  added: readonly OpportunityChange[];
  removed: readonly OpportunityChange[];
  /** Work not tied to a county; unaffected by county changes. */
  remote: readonly ExplorerOpportunity[];
  unknown: ReadonlyArray<{ opportunity: ExplorerOpportunity; reason: UnknownLocationReason }>;
  addedCounties: readonly WashingtonCountyName[];
  removedCounties: readonly WashingtonCountyName[];
  countyStats: Readonly<Record<WashingtonCountyName, CountyStat>>;
}

export interface CompareInput {
  opportunities: readonly ExplorerOpportunity[];
  baseline: ProfileServiceArea;
  draft: ServiceAreaSelection;
  policy?: Partial<InclusionPolicy>;
}

interface Entry {
  opportunity: ExplorerOpportunity;
  scope: OpportunityScope;
}

/**
 * Compares the confirmed service area with a draft over one catalog snapshot.
 * Pass the opportunities matching the user's other filters *without* any
 * county or service-area constraint, so newly reachable work is visible.
 */
export function compareServiceAreas({ opportunities, baseline, draft, policy }: CompareInput): ServiceAreaComparison {
  const inclusion: InclusionPolicy = { includeStatewide: policy?.includeStatewide ?? true };
  const { entries, duplicates } = uniqueEntries(opportunities);
  const before = selectionFromProfile(baseline);

  const beforeCounties = new Set(selectedCounties(before));
  const afterCounties = new Set(selectedCounties(draft));
  const addedCounties = WASHINGTON_COUNTY_NAMES.filter((c) => afterCounties.has(c) && !beforeCounties.has(c));
  const removedCounties = WASHINGTON_COUNTY_NAMES.filter((c) => beforeCounties.has(c) && !afterCounties.has(c));

  const added: OpportunityChange[] = [];
  const removed: OpportunityChange[] = [];
  const remote: ExplorerOpportunity[] = [];
  const unknown: Array<{ opportunity: ExplorerOpportunity; reason: UnknownLocationReason }> = [];

  for (const entry of entries) {
    const { scope, opportunity } = entry;
    if (scope.kind === 'remote') remote.push(opportunity);
    if (scope.kind === 'unknown') unknown.push({ opportunity, reason: scope.reason });

    const wasIn = isIncluded(scope, before, inclusion);
    const isIn = isIncluded(scope, draft, inclusion);
    if (wasIn === isIn) continue;
    const changed = isIn ? addedCounties : removedCounties;
    const viaCounties = scope.kind === 'counties' ? scope.counties.filter((c) => changed.includes(c)) : [];
    (isIn ? added : removed).push({ opportunity, scope, viaCounties });
  }

  added.sort(byDeadlineThenTitle);
  removed.sort(byDeadlineThenTitle);

  return {
    catalogSize: entries.length,
    duplicateIdsIgnored: duplicates,
    baselineComparable: isSelection(baseline) || baseline.kind === 'unset',
    before: tally(entries, before, inclusion),
    after: tally(entries, draft, inclusion),
    added,
    removed,
    remote,
    unknown,
    addedCounties,
    removedCounties,
    countyStats: countyStats(entries, draft, inclusion),
  };
}

function uniqueEntries(opportunities: readonly ExplorerOpportunity[]) {
  const seen = new Set<string>();
  const entries: Entry[] = [];
  let duplicates = 0;
  for (const opportunity of opportunities) {
    if (seen.has(opportunity.id)) {
      duplicates += 1;
      continue;
    }
    seen.add(opportunity.id);
    entries.push({ opportunity, scope: resolveScope(opportunity) });
  }
  return { entries, duplicates };
}

function tally(entries: readonly Entry[], selection: ServiceAreaSelection, policy: InclusionPolicy): AreaTally {
  const result: AreaTally = {
    included: 0,
    includedByCounty: 0,
    includedStatewide: 0,
    includedAgencyDerived: 0,
    outside: 0,
    outsideWithUnresolvedSites: 0,
    statewideNotIncluded: 0,
    remote: 0,
    unknown: 0,
  };
  for (const { scope } of entries) {
    if (scope.kind === 'remote') result.remote += 1;
    else if (scope.kind === 'unknown') result.unknown += 1;
    else if (!isIncluded(scope, selection, policy)) {
      if (scope.kind === 'statewide') result.statewideNotIncluded += 1;
      else {
        result.outside += 1;
        if (scope.hasUnresolvedSites) result.outsideWithUnresolvedSites += 1;
      }
    } else {
      result.included += 1;
      if (scope.kind === 'statewide') result.includedStatewide += 1;
      else {
        result.includedByCounty += 1;
        if (scope.agencyDerived) result.includedAgencyDerived += 1;
      }
    }
  }
  return result;
}

function countyStats(entries: readonly Entry[], draft: ServiceAreaSelection, policy: InclusionPolicy) {
  const stats = Object.fromEntries(
    WASHINGTON_COUNTY_NAMES.map((name) => [name, { total: 0, gainIfAdded: 0, lossIfRemoved: 0 }]),
  ) as Record<WashingtonCountyName, CountyStat>;
  const selected = new Set(selectedCounties(draft));
  const statewideWork = entries.filter((e) => e.scope.kind === 'statewide').length;

  for (const { scope } of entries) {
    if (scope.kind !== 'counties') continue;
    const inside = scope.counties.filter((c) => selected.has(c));
    for (const county of scope.counties) {
      stats[county].total += 1;
      if (inside.length === 0) stats[county].gainIfAdded += 1;
    }
    // Work reachable through exactly one selected county is lost if that county goes.
    if (inside.length === 1) stats[inside[0]].lossIfRemoved += 1;
  }

  // Statewide work joins with the first county and leaves with the last one.
  if (policy.includeStatewide && statewideWork > 0) {
    if (isEmptySelection(draft)) {
      for (const name of WASHINGTON_COUNTY_NAMES) stats[name].gainIfAdded += statewideWork;
    } else if (selected.size === 1) {
      stats[[...selected][0]].lossIfRemoved += statewideWork;
    }
  }
  return stats;
}

function deadlineTime(opportunity: ExplorerOpportunity): number {
  const value = opportunity.deadline?.value;
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

/** Closing soonest first; unknown deadlines last (SRS §8.2). */
function byDeadlineThenTitle(a: OpportunityChange, b: OpportunityChange): number {
  const ta = deadlineTime(a.opportunity);
  const tb = deadlineTime(b.opportunity);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.opportunity.title.localeCompare(b.opportunity.title) || a.opportunity.id.localeCompare(b.opportunity.id);
}
