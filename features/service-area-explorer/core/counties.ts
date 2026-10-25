/** Washington's 39 counties with Census FIPS codes, used as the service-area vocabulary. */
export const WASHINGTON_COUNTIES = [
  { name: 'Adams', fips: '53001' },
  { name: 'Asotin', fips: '53003' },
  { name: 'Benton', fips: '53005' },
  { name: 'Chelan', fips: '53007' },
  { name: 'Clallam', fips: '53009' },
  { name: 'Clark', fips: '53011' },
  { name: 'Columbia', fips: '53013' },
  { name: 'Cowlitz', fips: '53015' },
  { name: 'Douglas', fips: '53017' },
  { name: 'Ferry', fips: '53019' },
  { name: 'Franklin', fips: '53021' },
  { name: 'Garfield', fips: '53023' },
  { name: 'Grant', fips: '53025' },
  { name: 'Grays Harbor', fips: '53027' },
  { name: 'Island', fips: '53029' },
  { name: 'Jefferson', fips: '53031' },
  { name: 'King', fips: '53033' },
  { name: 'Kitsap', fips: '53035' },
  { name: 'Kittitas', fips: '53037' },
  { name: 'Klickitat', fips: '53039' },
  { name: 'Lewis', fips: '53041' },
  { name: 'Lincoln', fips: '53043' },
  { name: 'Mason', fips: '53045' },
  { name: 'Okanogan', fips: '53047' },
  { name: 'Pacific', fips: '53049' },
  { name: 'Pend Oreille', fips: '53051' },
  { name: 'Pierce', fips: '53053' },
  { name: 'San Juan', fips: '53055' },
  { name: 'Skagit', fips: '53057' },
  { name: 'Skamania', fips: '53059' },
  { name: 'Snohomish', fips: '53061' },
  { name: 'Spokane', fips: '53063' },
  { name: 'Stevens', fips: '53065' },
  { name: 'Thurston', fips: '53067' },
  { name: 'Wahkiakum', fips: '53069' },
  { name: 'Walla Walla', fips: '53071' },
  { name: 'Whatcom', fips: '53073' },
  { name: 'Whitman', fips: '53075' },
  { name: 'Yakima', fips: '53077' },
] as const;

export type WashingtonCountyName = (typeof WASHINGTON_COUNTIES)[number]['name'];

export const WASHINGTON_COUNTY_NAMES: readonly WashingtonCountyName[] = WASHINGTON_COUNTIES.map((c) => c.name);

const byKey = new Map<string, WashingtonCountyName>();
const fipsByName = new Map<WashingtonCountyName, string>();
for (const county of WASHINGTON_COUNTIES) {
  byKey.set(county.name.toLowerCase(), county.name);
  byKey.set(county.fips, county.name);
  fipsByName.set(county.name, county.fips);
}

/**
 * Maps a source county string ("King", "king county", "Pierce County, WA",
 * "53033") to the canonical Washington county name, or null when it is not a
 * Washington county. Never guesses from partial or misspelled names.
 */
export function normalizeCountyName(input: string | null | undefined): WashingtonCountyName | null {
  if (typeof input !== 'string') return null;
  const key = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/,\s*(wa|washington)\.?\s*$/, '')
    .replace(/\s+(county|co\.?)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return byKey.get(key) ?? null;
}

export function countyFips(name: WashingtonCountyName): string {
  return fipsByName.get(name) as string;
}

const order = new Map(WASHINGTON_COUNTY_NAMES.map((name, index) => [name, index]));

/** Deduplicates and returns counties in canonical alphabetical order. */
export function sortCounties(names: Iterable<WashingtonCountyName>): WashingtonCountyName[] {
  return [...new Set(names)].sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
}
