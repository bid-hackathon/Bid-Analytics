import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INITIAL_DRAFT_STATE,
  baselineMovedDuringDraft,
  draftReducer,
  effectiveBaseline,
  effectiveDraft,
  isDirty,
} from '../core/draft';
import type { DraftAction, DraftState } from '../core/draft';
import type { ProfileServiceArea } from '../core/serviceArea';

const baseline: ProfileServiceArea = { kind: 'counties', counties: ['King', 'Pierce'] };
const ctx = { baseline, revision: 3 };

function run(actions: DraftAction[], start: DraftState = INITIAL_DRAFT_STATE) {
  return actions.reduce(draftReducer, start);
}

describe('county selection', () => {
  it('starts mirroring the confirmed area without a draft', () => {
    assert.equal(INITIAL_DRAFT_STATE.draft, null);
    assert.deepEqual(effectiveDraft(INITIAL_DRAFT_STATE, baseline), baseline);
    assert.equal(isDirty(INITIAL_DRAFT_STATE, baseline), false);
  });

  it('adds and removes counties in canonical order', () => {
    const state = run([
      { type: 'toggle_county', county: 'Thurston', ...ctx },
      { type: 'toggle_county', county: 'Adams', ...ctx },
      { type: 'toggle_county', county: 'King', ...ctx },
    ]);
    assert.deepEqual(effectiveDraft(state, baseline), { kind: 'counties', counties: ['Adams', 'Pierce', 'Thurston'] });
    assert.equal(isDirty(state, baseline), true);
    assert.equal(state.basedOnRevision, 3);
  });

  it('ends the exploration when edits return to the confirmed area', () => {
    const state = run([
      { type: 'toggle_county', county: 'Thurston', ...ctx },
      { type: 'toggle_county', county: 'Thurston', ...ctx },
    ]);
    assert.equal(state.draft, null);
    assert.equal(isDirty(state, baseline), false);
  });

  it('switches to all of Washington and restores the prior counties when switched off', () => {
    const on = run([
      { type: 'toggle_county', county: 'Lewis', ...ctx },
      { type: 'set_statewide', enabled: true, ...ctx },
    ]);
    assert.deepEqual(effectiveDraft(on, baseline), { kind: 'statewide' });
    const off = draftReducer(on, { type: 'set_statewide', enabled: false, ...ctx });
    assert.deepEqual(effectiveDraft(off, baseline), { kind: 'counties', counties: ['King', 'Lewis', 'Pierce'] });
  });

  it('removing one county from all of Washington keeps the other 38', () => {
    const state = run([
      { type: 'set_statewide', enabled: true, ...ctx },
      { type: 'toggle_county', county: 'Yakima', ...ctx },
    ]);
    const draft = effectiveDraft(state, baseline);
    assert.equal(draft.kind, 'counties');
    if (draft.kind !== 'counties') return;
    assert.equal(draft.counties.length, 38);
    assert.ok(!draft.counties.includes('Yakima'));
  });

  it('clear empties the draft but does not touch the confirmed area', () => {
    const state = run([{ type: 'clear', ...ctx }]);
    assert.deepEqual(effectiveDraft(state, baseline), { kind: 'counties', counties: [] });
    assert.deepEqual(effectiveBaseline(state, baseline), baseline);
  });
});

describe('cancellation', () => {
  it('restores the confirmed area exactly, after any sequence of edits', () => {
    const state = run([
      { type: 'toggle_county', county: 'Thurston', ...ctx },
      { type: 'set_statewide', enabled: true, ...ctx },
      { type: 'toggle_county', county: 'King', ...ctx },
      { type: 'cancel' },
    ]);
    assert.equal(state.draft, null);
    assert.equal(isDirty(state, baseline), false);
    assert.deepEqual(effectiveDraft(state, baseline), baseline);
    // The statewide memory is cleared too, so the next toggle starts fresh.
    assert.deepEqual(state.countiesBeforeStatewide, []);
  });
});

describe('confirmed save', () => {
  it('holds the saved area as the baseline until the parent reports the new revision', () => {
    const saved: ProfileServiceArea = { kind: 'counties', counties: ['King', 'Pierce', 'Thurston'] };
    const afterSave = run([
      { type: 'toggle_county', county: 'Thurston', ...ctx },
      { type: 'saved', revision: 4, serviceArea: saved },
    ]);
    assert.equal(afterSave.draft, null);
    // The parent still passes revision 3's area; the explorer shows the saved one.
    assert.deepEqual(effectiveBaseline(afterSave, baseline), saved);
    assert.equal(isDirty(afterSave, effectiveBaseline(afterSave, baseline)), false);

    const caughtUp = draftReducer(afterSave, { type: 'profile_revision_changed' });
    assert.equal(caughtUp.pendingSaved, null);
    assert.deepEqual(effectiveBaseline(caughtUp, saved), saved);
  });

  it('notices a profile edited elsewhere during exploration', () => {
    const state = run([{ type: 'toggle_county', county: 'Thurston', ...ctx }]);
    assert.equal(baselineMovedDuringDraft(state, 3), false);
    assert.equal(baselineMovedDuringDraft(state, 5), true);
  });
});
