import type { LocationPrecision, Opportunity } from './contract';
import { normalizeCountyName, sortCounties } from './counties';
import type { WashingtonCountyName } from './counties';
import { isEmptySelection } from './serviceArea';
import type { ServiceAreaSelection } from './serviceArea';

/**
 * `resolutionMethod` value for a county taken from the issuing agency's
 * jurisdiction rather than from work-location evidence. Proposed contract value;
 * see adapters/bidRow.ts. Such counties count for inclusion but are disclosed.
 */
export const AGENCY_JURISDICTION_METHOD = 'agency_jurisdiction';

export type UnknownLocationReason =
  | 'no_location'
  | 'precision_unknown'
  | 'county_not_resolved'
  | 'not_a_washington_county';

/** Where an opportunity's work happens, independent of any service area. */
export type OpportunityScope =
  | {
      kind: 'counties';
      counties: readonly WashingtonCountyName[];
      /** More than one performance location (counted once regardless). */
      multiSite: boolean;
      /** Some sites have no resolvable county; they may lie anywhere. */
      hasUnresolvedSites: boolean;
      /** Every resolved county came from the agency's jurisdiction, not the work site. */
      agencyDerived: boolean;
      /** Precision of the single resolved site, or 'multiple'. */
      precision: LocationPrecision | 'multiple';
    }
  | { kind: 'statewide' }
  | { kind: 'remote' }
  | { kind: 'unknown'; reason: UnknownLocationReason };

/**
 * Resolves an opportunity's work location to Washington counties using only
 * county evidence on its performance locations. Display points are never used
 * because they may be disclosed approximations or agency addresses (SRS §4.4).
 */
export function resolveScope(opportunity: Opportunity): OpportunityScope {
  const { locations } = opportunity;
  if (locations.length === 0) {
    if (opportunity.locationStatus === 'statewide') return { kind: 'statewide' };
    if (opportunity.locationStatus === 'remote') return { kind: 'remote' };
    return { kind: 'unknown', reason: 'no_location' };
  }

  const counties: WashingtonCountyName[] = [];
  const resolvedPrecisions: LocationPrecision[] = [];
  let unresolvedReason: UnknownLocationReason | null = null;
  let unresolvedSites = 0;
  let remoteSites = 0;
  let allAgencyDerived = true;

  for (const location of locations) {
    if (location.precision === 'statewide') return { kind: 'statewide' };
    if (location.precision === 'remote') {
      remoteSites += 1;
      continue;
    }
    if (location.precision === 'unknown') {
      unresolvedSites += 1;
      unresolvedReason ??= 'precision_unknown';
      continue;
    }
    const names = location.countyNames ?? [];
    const resolved = names.map(normalizeCountyName).filter((name): name is WashingtonCountyName => name !== null);
    if (resolved.length === 0) {
      unresolvedSites += 1;
      unresolvedReason ??= names.length > 0 ? 'not_a_washington_county' : 'county_not_resolved';
      continue;
    }
    counties.push(...resolved);
    resolvedPrecisions.push(location.precision);
    if (location.resolutionMethod !== AGENCY_JURISDICTION_METHOD) allAgencyDerived = false;
  }

  if (counties.length > 0) {
    return {
      kind: 'counties',
      counties: sortCounties(counties),
      multiSite: locations.length > 1 || opportunity.locationStatus === 'multiple',
      hasUnresolvedSites: unresolvedSites > 0,
      agencyDerived: allAgencyDerived,
      precision: resolvedPrecisions.length === 1 ? resolvedPrecisions[0] : 'multiple',
    };
  }
  if (remoteSites === locations.length) return { kind: 'remote' };
  return { kind: 'unknown', reason: unresolvedReason ?? 'county_not_resolved' };
}

export interface InclusionPolicy {
  /**
   * Whether statewide-scope work counts as inside any non-empty Washington
   * service area. Mirrors the shared filter's `includeStatewide` (SRS §13.2).
   */
  includeStatewide: boolean;
}

/**
 * Geographic inclusion only; says nothing about capability fit. Multi-site
 * work is included when any resolved county is selected (SRS §8.3). Remote and
 * unknown locations are never inside or outside a county service area.
 */
export function isIncluded(scope: OpportunityScope, selection: ServiceAreaSelection, policy: InclusionPolicy): boolean {
  switch (scope.kind) {
    case 'counties':
      return selection.kind === 'statewide' || scope.counties.some((county) => selection.counties.includes(county));
    case 'statewide':
      return policy.includeStatewide && !isEmptySelection(selection);
    case 'remote':
    case 'unknown':
      return false;
  }
}
