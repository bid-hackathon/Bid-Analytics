/**
 * SYNTHETIC DEVELOPMENT FIXTURES. NOT REAL OPPORTUNITIES.
 *
 * For tests and the demo harness only. Never import this file from production
 * code or mix it into the real catalog (SRS D-14, §16). Every title starts with
 * "[Synthetic]" and agencies are fictional. County names are real only because
 * the geography under test is real. Each record exercises one location case.
 */
import { opportunitiesFromBidRows } from '../adapters/bidRow';
import type { BidRow } from '../adapters/bidRow';
import type { ExplorerOpportunity } from '../core/comparison';
import type { FitAssessment } from '../core/contract';
import type { ExplorerProfile } from '../core/serviceArea';

const agency = 'Synthetic fixture agency';

export const DEV_SYNTHETIC_OPPORTUNITIES: readonly ExplorerOpportunity[] = [
  {
    id: 'dev-fixture-01',
    version: 1,
    title: '[Synthetic] Residential asphalt patching, north district',
    agencyName: agency,
    deadline: { value: '2026-11-06', precision: 'date' },
    locationStatus: 'approximate',
    locations: [{ id: 'l1', label: 'Seattle', precision: 'city', cityName: 'Seattle', countyNames: ['King'] }],
  },
  {
    id: 'dev-fixture-02',
    version: 1,
    title: '[Synthetic] Arterial crack sealing, two corridors',
    agencyName: agency,
    deadline: { value: '2026-11-13T22:00:00Z', precision: 'datetime', timeZone: 'America/Los_Angeles' },
    locationStatus: 'multiple',
    locations: [
      { id: 'l1', label: 'Corridor A', precision: 'road_segment', countyNames: ['King'] },
      { id: 'l2', label: 'Corridor B', precision: 'road_segment', countyNames: ['Pierce'] },
    ],
  },
  {
    id: 'dev-fixture-03',
    version: 1,
    title: '[Synthetic] Stormwater pond excavation and regrading',
    agencyName: agency,
    deadline: { value: '2026-11-20', precision: 'date' },
    locationStatus: 'multiple',
    locations: [
      { id: 'l1', label: 'Pond 4', precision: 'address', countyNames: ['Pierce'] },
      { id: 'l2', label: 'Pond 9', precision: 'address', countyNames: ['Thurston'] },
    ],
  },
  {
    id: 'dev-fixture-04',
    version: 1,
    title: '[Synthetic] Park pathway concrete replacement',
    agencyName: agency,
    deadline: { value: '2026-11-10', precision: 'date' },
    locationStatus: 'located',
    locations: [{ id: 'l1', label: 'Example Park', precision: 'address', countyNames: ['Thurston'] }],
  },
  {
    id: 'dev-fixture-05',
    version: 1,
    title: '[Synthetic] Sidewalk ADA ramp retrofits',
    agencyName: agency,
    deadline: { value: '2026-12-01', precision: 'date' },
    locationStatus: 'approximate',
    locations: [{ id: 'l1', label: 'Everett', precision: 'city', cityName: 'Everett', countyNames: ['Snohomish'] }],
  },
  {
    id: 'dev-fixture-06',
    version: 1,
    title: '[Synthetic] On-call pavement repair, state routes',
    agencyName: agency,
    deadline: { value: '2026-12-04', precision: 'date' },
    locationStatus: 'statewide',
    locations: [{ id: 'l1', label: 'Statewide', precision: 'statewide' }],
  },
  {
    id: 'dev-fixture-07',
    version: 1,
    title: '[Synthetic] Culvert replacement, site in plan set',
    agencyName: agency,
    deadline: null,
    locationStatus: 'unknown',
    locations: [],
  },
  {
    id: 'dev-fixture-08',
    version: 1,
    title: '[Synthetic] Trail drainage improvements',
    agencyName: agency,
    deadline: { value: '2026-11-18', precision: 'date' },
    locationStatus: 'approximate',
    // City is known, county is not; a city that spans counties must not be guessed.
    locations: [{ id: 'l1', label: 'Bothell', precision: 'city', cityName: 'Bothell', countyNames: [] }],
  },
  {
    id: 'dev-fixture-09',
    version: 1,
    title: '[Synthetic] Pavement condition survey analysis',
    agencyName: agency,
    deadline: { value: '2026-11-25', precision: 'date' },
    locationStatus: 'remote',
    locations: [{ id: 'l1', label: 'Remote', precision: 'remote' }],
  },
  {
    id: 'dev-fixture-10',
    version: 1,
    title: '[Synthetic] Gravel shoulder rebuild',
    agencyName: agency,
    deadline: { value: '2026-11-16', precision: 'date' },
    locationStatus: 'located',
    locations: [{ id: 'l1', label: 'Mile 3.2', precision: 'exact_site', countyNames: ['Spokane'] }],
  },
  {
    id: 'dev-fixture-11',
    version: 1,
    title: '[Synthetic] Terminal parking lot resurfacing',
    agencyName: agency,
    deadline: { value: '2026-11-09', precision: 'date' },
    locationStatus: 'located',
    locations: [{ id: 'l1', label: 'Terminal lot', precision: 'address', countyNames: ['Kitsap'] }],
  },
  {
    id: 'dev-fixture-12',
    version: 1,
    title: '[Synthetic] Roadside vegetation management',
    agencyName: agency,
    deadline: { value: '2026-12-10', precision: 'date' },
    locationStatus: 'approximate',
    locations: [{ id: 'l1', label: 'Clark County', precision: 'county', countyNames: ['Clark'] }],
  },
  {
    id: 'dev-fixture-13',
    version: 1,
    title: '[Synthetic] Retaining wall repair, second site to be determined',
    agencyName: agency,
    deadline: { value: '2026-11-12', precision: 'date' },
    locationStatus: 'multiple',
    locations: [
      { id: 'l1', label: 'Wall 1', precision: 'address', countyNames: ['Pierce'] },
      { id: 'l2', label: 'Wall 2 (TBD)', precision: 'unknown' },
    ],
  },
  {
    id: 'dev-fixture-14',
    version: 1,
    title: '[Synthetic] Ditch cleaning, two counties',
    agencyName: agency,
    deadline: { value: '2026-11-23', precision: 'date' },
    locationStatus: 'multiple',
    locations: [
      { id: 'l1', label: 'Thurston segments', precision: 'county', countyNames: ['Thurston'] },
      { id: 'l2', label: 'Mason segments', precision: 'county', countyNames: ['Mason'] },
    ],
  },
  {
    id: 'dev-fixture-15',
    version: 1,
    title: '[Synthetic] Pothole repair, residential streets',
    agencyName: agency,
    deadline: { value: '2026-11-08', precision: 'date' },
    locationStatus: 'approximate',
    locations: [{ id: 'l1', label: 'Pierce County', precision: 'county', countyNames: ['Pierce County'] }],
  },
];

/**
 * Workstream C's mock rows (data/mock/bids.json on PR #1), through the bids
 * adapter. Their county comes from the agency record, so it is disclosed.
 */
const WORKSTREAM_C_MOCK_ROWS: readonly BidRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    agency: 'City of Tacoma',
    title: 'MOCK: 2026 Residential Pothole Repair, Small Works',
    status: 'open',
    state: 'WA',
    county: 'Pierce',
    city: 'Tacoma',
    location_text: 'North Tacoma, WA',
    deadline: '2026-11-05T22:00:00Z',
    updated_at: '2026-10-25T21:00:00Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    agency: 'Benton County PUD',
    title: 'MOCK: Substation Landscaping Maintenance',
    status: 'open',
    state: 'WA',
    county: 'Benton',
    city: 'Kennewick',
    location_text: 'Kennewick, WA',
    deadline: '2026-11-12T23:00:00Z',
    updated_at: '2026-10-25T21:00:00Z',
  },
];

export const DEV_FIXTURE_CATALOG: readonly ExplorerOpportunity[] = [
  ...DEV_SYNTHETIC_OPPORTUNITIES,
  ...opportunitiesFromBidRows(WORKSTREAM_C_MOCK_ROWS).opportunities,
];

export const DEV_FIXTURE_PROFILE: ExplorerProfile = {
  profileId: 'dev-fixture-profile',
  revision: 3,
  serviceArea: { kind: 'counties', counties: ['King', 'Pierce', 'Snohomish'] },
};

/**
 * Assessments shaped like Workstream B's output for revision 3. dev-fixture-04
 * also has a stale revision-2 record that must be ignored.
 */
export const DEV_FIXTURE_ASSESSMENTS: readonly FitAssessment[] = [
  { opportunityId: 'dev-fixture-01', profileRevision: 3, state: 'assessed', tier: 'good_fit' },
  { opportunityId: 'dev-fixture-02', profileRevision: 3, state: 'assessed', tier: 'possible_fit' },
  { opportunityId: 'dev-fixture-03', profileRevision: 3, state: 'assessed', tier: 'needs_review' },
  { opportunityId: 'dev-fixture-04', profileRevision: 2, state: 'assessed', tier: 'good_fit' },
  { opportunityId: 'dev-fixture-04', profileRevision: 3, state: 'assessed', tier: 'not_a_fit' },
  { opportunityId: 'dev-fixture-05', profileRevision: 3, state: 'assessed', tier: 'possible_fit' },
  { opportunityId: 'dev-fixture-06', profileRevision: 3, state: 'assessed', tier: 'possible_fit' },
  { opportunityId: 'dev-fixture-13', profileRevision: 3, state: 'pending' },
  { opportunityId: 'dev-fixture-15', profileRevision: 3, state: 'assessed', tier: 'good_fit' },
];
