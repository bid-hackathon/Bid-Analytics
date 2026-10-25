import type { ProfileRevision } from './contract';
import { WASHINGTON_COUNTY_NAMES, countyFips, normalizeCountyName, sortCounties } from './counties';
import type { WashingtonCountyName } from './counties';

/** A service area the explorer can edit: a set of counties, or all of Washington. */
export type ServiceAreaSelection =
  | { kind: 'counties'; counties: readonly WashingtonCountyName[] }
  | { kind: 'statewide' };

/**
 * The confirmed profile's service area. `unset` means the profile has none yet;
 * `unsupported` covers radius or drawn areas that cannot be compared by county.
 */
export type ProfileServiceArea =
  | ServiceAreaSelection
  | { kind: 'unset' }
  | { kind: 'unsupported'; description: string };

/** The slice of the active confirmed profile this feature needs. */
export interface ExplorerProfile {
  profileId: string;
  revision: ProfileRevision;
  serviceArea: ProfileServiceArea;
  /** Full confirmed profile, for save adapters that must send the whole record. */
  vendorProfile?: Readonly<Record<string, unknown>>;
}

export const EMPTY_SELECTION: ServiceAreaSelection = { kind: 'counties', counties: [] };

export function isSelection(area: ProfileServiceArea): area is ServiceAreaSelection {
  return area.kind === 'counties' || area.kind === 'statewide';
}

/** The editable starting point for a profile's service area. */
export function selectionFromProfile(area: ProfileServiceArea): ServiceAreaSelection {
  return isSelection(area) ? area : EMPTY_SELECTION;
}

export function selectedCounties(selection: ServiceAreaSelection): readonly WashingtonCountyName[] {
  return selection.kind === 'statewide' ? WASHINGTON_COUNTY_NAMES : selection.counties;
}

export function isEmptySelection(selection: ServiceAreaSelection): boolean {
  return selection.kind === 'counties' && selection.counties.length === 0;
}

export function sameSelection(a: ServiceAreaSelection, b: ServiceAreaSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'statewide' || b.kind === 'statewide') return true;
  const left = sortCounties(a.counties);
  const right = sortCounties(b.counties);
  return left.length === right.length && left.every((name, i) => name === right[i]);
}

/** True when a draft makes no change to the profile's confirmed service area. */
export function matchesProfileArea(draft: ServiceAreaSelection, area: ProfileServiceArea): boolean {
  return isSelection(area) ? sameSelection(draft, area) : isEmptySelection(draft);
}

export function withCountyToggled(selection: ServiceAreaSelection, county: WashingtonCountyName): ServiceAreaSelection {
  // Toggling one county off "all of Washington" leaves every other county selected.
  if (selection.kind === 'statewide') {
    return { kind: 'counties', counties: WASHINGTON_COUNTY_NAMES.filter((name) => name !== county) };
  }
  const has = selection.counties.includes(county);
  return {
    kind: 'counties',
    counties: has ? selection.counties.filter((name) => name !== county) : sortCounties([...selection.counties, county]),
  };
}

export function selectionLabel(selection: ServiceAreaSelection): string {
  if (selection.kind === 'statewide') return 'All of Washington';
  const { counties } = selection;
  if (counties.length === 0) return 'No counties';
  if (counties.length <= 3) return counties.join(', ');
  return `${counties.slice(0, 2).join(', ')} and ${counties.length - 2} more`;
}

export function profileAreaLabel(area: ProfileServiceArea): string {
  if (area.kind === 'unset') return 'Not set';
  if (area.kind === 'unsupported') return area.description;
  return selectionLabel(area);
}

/**
 * Reads a profile's service area while Workstream B's VendorProfile schema is
 * pending. Accepts the shapes this feature writes plus common variants, and
 * reports anything it cannot represent as counties instead of guessing.
 */
export function parseProfileServiceArea(raw: unknown): ProfileServiceArea {
  if (raw == null) return { kind: 'unset' };
  if (raw === 'statewide') return { kind: 'statewide' };
  if (Array.isArray(raw)) return countiesOrUnsupported(raw);
  if (typeof raw !== 'object') return { kind: 'unsupported', description: 'Unrecognized service area' };

  const value = raw as Record<string, unknown>;
  const kind = value.kind ?? value.type;
  const original = typeof value.originalText === 'string' && value.originalText.trim() ? value.originalText.trim() : null;
  if (kind === 'statewide') return { kind: 'statewide' };
  if (kind === 'counties' || (kind === undefined && (value.countyNames || value.counties))) {
    const list = value.countyNames ?? value.counties;
    return Array.isArray(list) ? countiesOrUnsupported(list) : { kind: 'unset' };
  }
  if (kind === 'radius') {
    const miles = typeof value.radiusMiles === 'number' ? `${value.radiusMiles} mi` : 'A radius';
    const base = typeof value.baseLabel === 'string' ? ` around ${value.baseLabel}` : '';
    return { kind: 'unsupported', description: original ?? `${miles}${base}` };
  }
  if (kind === 'polygon') return { kind: 'unsupported', description: original ?? 'A custom drawn area' };
  return { kind: 'unsupported', description: original ?? 'Unrecognized service area' };
}

function countiesOrUnsupported(list: readonly unknown[]): ProfileServiceArea {
  const names = list.map((item) => normalizeCountyName(typeof item === 'string' ? item : null));
  if (names.some((name) => name === null)) {
    return { kind: 'unsupported', description: `Counties outside the Washington list: ${list.join(', ')}` };
  }
  return { kind: 'counties', counties: sortCounties(names as WashingtonCountyName[]) };
}

/**
 * Proposed VendorProfile.serviceArea payload for a confirmed county edit.
 * Pending agreement with Workstream B; parseProfileServiceArea reads it back.
 */
export function toProfileServiceAreaPayload(selection: ServiceAreaSelection) {
  if (selection.kind === 'statewide') {
    return { kind: 'statewide' as const, provenance: 'user_entered' as const };
  }
  return {
    kind: 'counties' as const,
    countyNames: [...selection.counties],
    countyFips: selection.counties.map(countyFips),
    provenance: 'user_entered' as const,
  };
}
