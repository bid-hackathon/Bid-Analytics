import type { ServiceAreaComparison } from './comparison';
import { WASHINGTON_COUNTIES } from './counties';
import type { WashingtonCountyName } from './counties';
import { selectedCounties, selectionFromProfile } from './serviceArea';
import type { ProfileServiceArea, ServiceAreaSelection } from './serviceArea';

/**
 * Role of a county in the highlight:
 * - `current`: in the confirmed area (no exploration in progress)
 * - `kept`: in both the confirmed area and the draft
 * - `added` / `removed`: only in the draft / only in the confirmed area
 */
export type CountyHighlightState = 'current' | 'kept' | 'added' | 'removed';

/**
 * Everything the parent map needs to draw the service area. The explorer never
 * renders geography itself. County entries carry FIPS codes so the map can key
 * feature state on its county layer.
 */
export interface ServiceAreaMapHighlight {
  mode: 'confirmed' | 'exploring';
  counties: ReadonlyArray<{ name: WashingtonCountyName; fips: string; state: CountyHighlightState }>;
  /** Counties-only area vs all of Washington, before and during exploration. */
  statewide: { confirmed: boolean; draft: boolean };
  addedOpportunityIds: readonly string[];
  removedOpportunityIds: readonly string[];
  /** Opportunity the user is pointing at in the explorer list, for marker emphasis. */
  focusedOpportunityId: string | null;
}

export function buildMapHighlight(input: {
  baseline: ProfileServiceArea;
  draft: ServiceAreaSelection;
  exploring: boolean;
  comparison: ServiceAreaComparison | null;
  focusedOpportunityId: string | null;
}): ServiceAreaMapHighlight {
  const confirmed = selectionFromProfile(input.baseline);
  const before = new Set(selectedCounties(confirmed));
  const after = new Set(selectedCounties(input.draft));

  const counties: Array<ServiceAreaMapHighlight['counties'][number]> = [];
  for (const { name, fips } of WASHINGTON_COUNTIES) {
    const state = countyState(before.has(name), after.has(name), input.exploring);
    if (state) counties.push({ name, fips, state });
  }

  return {
    mode: input.exploring ? 'exploring' : 'confirmed',
    counties,
    statewide: { confirmed: confirmed.kind === 'statewide', draft: input.draft.kind === 'statewide' },
    addedOpportunityIds: input.exploring ? (input.comparison?.added.map((c) => c.opportunity.id) ?? []) : [],
    removedOpportunityIds: input.exploring ? (input.comparison?.removed.map((c) => c.opportunity.id) ?? []) : [],
    focusedOpportunityId: input.focusedOpportunityId,
  };
}

function countyState(inBefore: boolean, inAfter: boolean, exploring: boolean): CountyHighlightState | null {
  if (!exploring) return inBefore ? 'current' : null;
  if (inBefore && inAfter) return 'kept';
  if (inAfter) return 'added';
  if (inBefore) return 'removed';
  return null;
}
