import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { opportunitiesFromBidRows } from '../adapters/bidRow';
import { createHttpServiceAreaServices } from '../adapters/http';
import { WASHINGTON_COUNTIES, normalizeCountyName } from '../core/counties';
import { resolveScope } from '../core/geography';
import { buildMapHighlight } from '../core/highlight';
import { parseProfileServiceArea, toProfileServiceAreaPayload } from '../core/serviceArea';

describe('counties', () => {
  it('lists all 39 Washington counties with unique FIPS codes', () => {
    assert.equal(WASHINGTON_COUNTIES.length, 39);
    assert.equal(new Set(WASHINGTON_COUNTIES.map((c) => c.fips)).size, 39);
  });

  it('normalizes common spellings and rejects anything else', () => {
    assert.equal(normalizeCountyName('king county'), 'King');
    assert.equal(normalizeCountyName('  Walla  Walla County, WA '), 'Walla Walla');
    assert.equal(normalizeCountyName('53053'), 'Pierce');
    assert.equal(normalizeCountyName('Multnomah'), null);
    assert.equal(normalizeCountyName('Kin'), null);
  });
});

describe('profile service area round trip', () => {
  it('reads back what it writes', () => {
    const payload = toProfileServiceAreaPayload({ kind: 'counties', counties: ['King', 'Pierce'] });
    assert.deepEqual(parseProfileServiceArea(payload), { kind: 'counties', counties: ['King', 'Pierce'] });
    assert.deepEqual(parseProfileServiceArea(toProfileServiceAreaPayload({ kind: 'statewide' })), { kind: 'statewide' });
  });

  it('reports radius and unknown counties as unsupported instead of guessing', () => {
    assert.equal(parseProfileServiceArea({ kind: 'radius', radiusMiles: 40, baseLabel: 'Tacoma' }).kind, 'unsupported');
    assert.equal(parseProfileServiceArea(['King', 'Multnomah']).kind, 'unsupported');
    assert.deepEqual(parseProfileServiceArea(null), { kind: 'unset' });
  });
});

describe('bids row adapter', () => {
  const rows = [
    { id: 'a', agency: 'City of Tacoma', title: 'A', state: 'WA', county: 'Pierce', city: 'Tacoma', status: 'cancelled' },
    { id: 'b', agency: 'Somewhere', title: 'B', state: 'OR', county: 'Multnomah' },
    { id: 'c', agency: 'Agency C', title: 'C', state: 'WA', county: null },
  ];

  it('skips out-of-state rows, maps status spelling, and keeps a missing county unknown', () => {
    const { opportunities, skippedOutOfState } = opportunitiesFromBidRows(rows);
    assert.equal(skippedOutOfState, 1);
    assert.deepEqual(opportunities.map((o) => o.id), ['a', 'c']);
    assert.equal(opportunities[0].status, 'canceled');
    assert.equal(resolveScope(opportunities[1]).kind, 'unknown');
  });

  it('discloses agency-derived counties unless told they are work locations', () => {
    const disclosed = resolveScope(opportunitiesFromBidRows(rows).opportunities[0]);
    assert.equal(disclosed.kind === 'counties' && disclosed.agencyDerived, true);
    const confirmed = resolveScope(opportunitiesFromBidRows(rows, { countyBasis: 'work_location' }).opportunities[0]);
    assert.equal(confirmed.kind === 'counties' && confirmed.agencyDerived, false);
  });
});

describe('HTTP services', () => {
  function stubFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }
  const signal = new AbortController().signal;

  it('saves through PUT /me/profile with the base revision', async () => {
    const { fetchImpl, calls } = stubFetch(200, { data: { id: 'p', revision: 8, serviceArea: { kind: 'statewide' } }, error: null });
    const services = createHttpServiceAreaServices({ fetch: fetchImpl });
    const saved = await services.saveServiceArea(
      { profileId: 'p', baseRevision: 7, serviceArea: { kind: 'statewide' }, vendorProfile: { businessName: 'X' } },
      { signal },
    );
    assert.deepEqual(saved, { profileId: 'p', revision: 8, serviceArea: { kind: 'statewide' } });
    assert.equal(calls[0].url, '/api/v1/me/profile');
    assert.equal(calls[0].init.method, 'PUT');
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.baseRevision, 7);
    assert.equal(body.businessName, 'X');
  });

  it('maps an error envelope to a ServiceError', async () => {
    const { fetchImpl } = stubFetch(409, { data: null, error: { code: 'revision_conflict', message: 'Stale', retryable: false } });
    const services = createHttpServiceAreaServices({ fetch: fetchImpl });
    await assert.rejects(
      services.saveServiceArea({ profileId: 'p', baseRevision: 7, serviceArea: { kind: 'statewide' } }, { signal }),
      { code: 'revision_conflict', retryable: false },
    );
  });

  it('refuses match results without a profile revision', async () => {
    const { fetchImpl } = stubFetch(200, { data: [], meta: {}, error: null });
    const services = createHttpServiceAreaServices({ fetch: fetchImpl });
    await assert.rejects(services.fetchAssessments!({ profileId: 'p', profileRevision: 8 }, { signal }), { code: 'internal_error' });
  });

  it('reads the revision from match metadata', async () => {
    const { fetchImpl } = stubFetch(200, {
      data: [{ opportunityId: 'o', profileRevision: 8, state: 'assessed', tier: 'good_fit' }],
      meta: { profileRevision: 8, rankingVersion: 'r1' },
      error: null,
    });
    const services = createHttpServiceAreaServices({ fetch: fetchImpl });
    const result = await services.fetchAssessments!({ profileId: 'p', profileRevision: 8 }, { signal });
    assert.equal(result.profileRevision, 8);
    assert.equal(result.rankingVersion, 'r1');
  });
});

describe('map highlight', () => {
  it('labels kept, added and removed counties with FIPS codes while exploring', () => {
    const highlight = buildMapHighlight({
      baseline: { kind: 'counties', counties: ['King', 'Pierce'] },
      draft: { kind: 'counties', counties: ['King', 'Thurston'] },
      exploring: true,
      comparison: null,
      focusedOpportunityId: null,
    });
    assert.deepEqual(highlight.counties, [
      { name: 'King', fips: '53033', state: 'kept' },
      { name: 'Pierce', fips: '53053', state: 'removed' },
      { name: 'Thurston', fips: '53067', state: 'added' },
    ]);
  });

  it('shows only the confirmed area when not exploring', () => {
    const highlight = buildMapHighlight({
      baseline: { kind: 'counties', counties: ['King'] },
      draft: { kind: 'counties', counties: ['King'] },
      exploring: false,
      comparison: null,
      focusedOpportunityId: null,
    });
    assert.deepEqual(highlight.counties, [{ name: 'King', fips: '53033', state: 'current' }]);
    assert.equal(highlight.mode, 'confirmed');
  });
});
