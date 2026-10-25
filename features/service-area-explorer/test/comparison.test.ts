import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareServiceAreas } from '../core/comparison';
import type { ExplorerOpportunity } from '../core/comparison';
import { resolveScope } from '../core/geography';
import type { ProfileServiceArea, ServiceAreaSelection } from '../core/serviceArea';
import { DEV_FIXTURE_CATALOG } from '../fixtures/syntheticOpportunities.dev';

const KPS: ProfileServiceArea = { kind: 'counties', counties: ['King', 'Pierce', 'Snohomish'] };
const counties = (...names: string[]) => ({ kind: 'counties', counties: names }) as ServiceAreaSelection;
const ids = (changes: readonly { opportunity: { id: string } }[]) => changes.map((c) => c.opportunity.id).sort();

function opp(id: string, partial: Partial<ExplorerOpportunity>): ExplorerOpportunity {
  return { id, title: id, locations: [], locationStatus: 'unknown', ...partial };
}

describe('resolveScope', () => {
  it('keeps unknown locations unknown and never guesses a county from a city', () => {
    const byId = new Map(DEV_FIXTURE_CATALOG.map((o) => [o.id, resolveScope(o)]));
    assert.deepEqual(byId.get('dev-fixture-07'), { kind: 'unknown', reason: 'no_location' });
    assert.deepEqual(byId.get('dev-fixture-08'), { kind: 'unknown', reason: 'county_not_resolved' });
    assert.equal(byId.get('dev-fixture-09')?.kind, 'remote');
    assert.equal(byId.get('dev-fixture-06')?.kind, 'statewide');
  });

  it('treats non-Washington county names as unresolved rather than outside', () => {
    const scope = resolveScope(
      opp('x', { locationStatus: 'approximate', locations: [{ id: 'a', precision: 'county', countyNames: ['Multnomah'] }] }),
    );
    assert.deepEqual(scope, { kind: 'unknown', reason: 'not_a_washington_county' });
  });

  it('resolves multi-site work to the union of counties and flags unresolved sites', () => {
    const scope = resolveScope(DEV_FIXTURE_CATALOG.find((o) => o.id === 'dev-fixture-13')!);
    assert.equal(scope.kind, 'counties');
    if (scope.kind !== 'counties') return;
    assert.deepEqual(scope.counties, ['Pierce']);
    assert.equal(scope.hasUnresolvedSites, true);
    assert.equal(scope.multiSite, true);
  });

  it('marks counties from the agency jurisdiction as agency-derived', () => {
    const tacoma = DEV_FIXTURE_CATALOG.find((o) => o.id.endsWith('0001'))!;
    const scope = resolveScope(tacoma);
    assert.equal(scope.kind === 'counties' && scope.agencyDerived, true);
  });

  it('ignores display points entirely', () => {
    const scope = resolveScope(
      opp('x', {
        locationStatus: 'approximate',
        locations: [{ id: 'a', precision: 'city', cityName: 'Olympia', displayPointBasis: 'agency headquarters' }],
      }),
    );
    assert.equal(scope.kind, 'unknown');
  });
});

describe('compareServiceAreas', () => {
  it('reports no changes when the draft equals the confirmed area', () => {
    const result = compareServiceAreas({ opportunities: DEV_FIXTURE_CATALOG, baseline: KPS, draft: KPS as ServiceAreaSelection });
    assert.equal(result.added.length, 0);
    assert.equal(result.removed.length, 0);
    assert.equal(result.before.included, result.after.included);
  });

  it('adds a county: multi-site work already reachable is not "newly included"', () => {
    const result = compareServiceAreas({
      opportunities: DEV_FIXTURE_CATALOG,
      baseline: KPS,
      draft: counties('King', 'Pierce', 'Snohomish', 'Thurston'),
    });
    // dev-03 (Pierce + Thurston) was already in via Pierce.
    assert.deepEqual(ids(result.added), ['dev-fixture-04', 'dev-fixture-14']);
    assert.deepEqual(result.removed, []);
    assert.deepEqual(result.addedCounties, ['Thurston']);
    assert.equal(result.after.included - result.before.included, 2);
    const ditch = result.added.find((c) => c.opportunity.id === 'dev-fixture-14')!;
    assert.deepEqual(ditch.viaCounties, ['Thurston']);
  });

  it('removes a county: work still reachable through another selected county stays', () => {
    const result = compareServiceAreas({ opportunities: DEV_FIXTURE_CATALOG, baseline: KPS, draft: counties('King', 'Snohomish') });
    // dev-02 spans King and Pierce, so it stays.
    assert.ok(!ids(result.removed).includes('dev-fixture-02'));
    assert.deepEqual(ids(result.removed), [
      '00000000-0000-0000-0000-000000000001',
      'dev-fixture-03',
      'dev-fixture-13',
      'dev-fixture-15',
    ]);
  });

  it('counts each opportunity once, including repeated records', () => {
    const doubled = [...DEV_FIXTURE_CATALOG, DEV_FIXTURE_CATALOG[1], DEV_FIXTURE_CATALOG[1]];
    const result = compareServiceAreas({ opportunities: doubled, baseline: KPS, draft: counties('King', 'Pierce') });
    assert.equal(result.catalogSize, DEV_FIXTURE_CATALOG.length);
    assert.equal(result.duplicateIdsIgnored, 2);
    // dev-01, dev-02 (King + Pierce, once), dev-03, dev-13, dev-15 and the Tacoma mock.
    assert.equal(result.after.includedByCounty, 6);
    // Plus the statewide dev-06.
    assert.equal(result.after.included, 7);
  });

  it('partitions the catalog: every opportunity lands in exactly one bucket', () => {
    for (const draft of [counties(), counties('King'), counties('Thurston', 'Mason'), { kind: 'statewide' } as const]) {
      const { after, catalogSize } = compareServiceAreas({ opportunities: DEV_FIXTURE_CATALOG, baseline: KPS, draft });
      const sum = after.included + after.outside + after.statewideNotIncluded + after.remote + after.unknown;
      assert.equal(sum, catalogSize, `partition for ${JSON.stringify(draft)}`);
    }
  });

  it('keeps unknown and remote work out of every county change', () => {
    const result = compareServiceAreas({ opportunities: DEV_FIXTURE_CATALOG, baseline: KPS, draft: { kind: 'statewide' } });
    const changed = new Set([...ids(result.added), ...ids(result.removed)]);
    for (const id of ['dev-fixture-07', 'dev-fixture-08', 'dev-fixture-09']) assert.ok(!changed.has(id), id);
    assert.deepEqual(result.unknown.map((u) => u.opportunity.id).sort(), ['dev-fixture-07', 'dev-fixture-08']);
    assert.deepEqual(result.remote.map((o) => o.id), ['dev-fixture-09']);
  });

  it('includes statewide work in any non-empty area, and honors includeStatewide', () => {
    const statewide = DEV_FIXTURE_CATALOG.filter((o) => o.id === 'dev-fixture-06');
    const fromEmpty = compareServiceAreas({ opportunities: statewide, baseline: { kind: 'unset' }, draft: counties('Spokane') });
    assert.deepEqual(ids(fromEmpty.added), ['dev-fixture-06']);
    assert.deepEqual(fromEmpty.added[0].viaCounties, []);

    const excluded = compareServiceAreas({
      opportunities: statewide,
      baseline: { kind: 'unset' },
      draft: counties('Spokane'),
      policy: { includeStatewide: false },
    });
    assert.equal(excluded.added.length, 0);
    assert.equal(excluded.after.statewideNotIncluded, 1);
  });

  it('flags a radius baseline as not comparable instead of inventing a count', () => {
    const result = compareServiceAreas({
      opportunities: DEV_FIXTURE_CATALOG,
      baseline: { kind: 'unsupported', description: '40 mi around Tacoma' },
      draft: counties('Pierce'),
    });
    assert.equal(result.baselineComparable, false);
  });

  it('orders changes by deadline with unknown deadlines last', () => {
    const list = [
      opp('late', { deadline: { value: '2026-12-01', precision: 'date' }, locationStatus: 'located', locations: [{ id: 'a', precision: 'county', countyNames: ['Lewis'] }] }),
      opp('none', { deadline: null, locationStatus: 'located', locations: [{ id: 'a', precision: 'county', countyNames: ['Lewis'] }] }),
      opp('soon', { deadline: { value: '2026-11-01', precision: 'date' }, locationStatus: 'located', locations: [{ id: 'a', precision: 'county', countyNames: ['Lewis'] }] }),
    ];
    const result = compareServiceAreas({ opportunities: list, baseline: { kind: 'unset' }, draft: counties('Lewis') });
    assert.deepEqual(result.added.map((c) => c.opportunity.id), ['soon', 'late', 'none']);
  });

  it('reports marginal gains and losses per county for the picker', () => {
    const { countyStats } = compareServiceAreas({ opportunities: DEV_FIXTURE_CATALOG, baseline: KPS, draft: KPS as ServiceAreaSelection });
    assert.equal(countyStats.Thurston.gainIfAdded, 2); // dev-04, dev-14 (dev-03 already in via Pierce)
    assert.equal(countyStats.Pierce.lossIfRemoved, 4); // dev-03, dev-13, dev-15, Tacoma mock; dev-02 stays via King
    assert.equal(countyStats.King.gainIfAdded, 0);
    assert.equal(countyStats.Benton.gainIfAdded, 1);
  });
});
