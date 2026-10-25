import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fitFor, indexCurrentAssessments, normalizeFitTier, tallyFit } from '../core/assessments';
import { DEV_FIXTURE_ASSESSMENTS, DEV_FIXTURE_CATALOG } from '../fixtures/syntheticOpportunities.dev';

describe('fit assessments', () => {
  const index = indexCurrentAssessments(DEV_FIXTURE_ASSESSMENTS, 3, DEV_FIXTURE_CATALOG);

  it('uses only the active revision and ignores older ones', () => {
    // dev-04 has a stale revision-2 "Good fit"; revision 3 says "Not a fit".
    assert.deepEqual(fitFor(index, 'dev-fixture-04'), { kind: 'assessed', tier: 'not_a_fit', label: 'Not a fit' });
    const onlyOld = indexCurrentAssessments(DEV_FIXTURE_ASSESSMENTS, 4, DEV_FIXTURE_CATALOG);
    assert.equal(onlyOld.size, 0);
  });

  it('treats a missing assessment as unassessed, never as Not a fit', () => {
    assert.deepEqual(fitFor(index, 'dev-fixture-10'), { kind: 'not_assessed' });
    assert.deepEqual(fitFor(index, 'dev-fixture-13'), { kind: 'pending' });
  });

  it('drops an assessment of an outdated opportunity version', () => {
    const stale = indexCurrentAssessments(
      [{ opportunityId: 'dev-fixture-01', opportunityVersion: 0, profileRevision: 3, state: 'assessed', tier: 'good_fit' }],
      3,
      DEV_FIXTURE_CATALOG,
    );
    assert.equal(stale.size, 0);
  });

  it('never invents a tier from an unrecognized value', () => {
    const odd = indexCurrentAssessments(
      [{ opportunityId: 'x', profileRevision: 3, state: 'assessed', tier: 'excellent' }],
      3,
    );
    assert.deepEqual(fitFor(odd, 'x'), { kind: 'unavailable' });
    assert.equal(normalizeFitTier('Good fit'), 'good_fit');
    assert.equal(normalizeFitTier('needs-review'), 'needs_review');
    assert.equal(normalizeFitTier('constructor'), null);
  });

  it('tallies tiers and counts everything else as unassessed', () => {
    const tally = tallyFit(index, ['dev-fixture-01', 'dev-fixture-02', 'dev-fixture-13', 'dev-fixture-10']);
    assert.deepEqual(tally, { good_fit: 1, possible_fit: 1, needs_review: 0, not_a_fit: 0, unassessed: 2 });
  });
});
