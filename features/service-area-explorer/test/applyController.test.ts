import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApplyController } from '../core/applyController';
import type { ProfileRevision } from '../core/contract';
import type { AssessmentBatch, SavedServiceArea, ServiceAreaServices } from '../core/services';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const batch = (revision: ProfileRevision): AssessmentBatch => ({
  profileRevision: revision,
  assessments: [{ opportunityId: 'o1', profileRevision: revision, state: 'assessed', tier: 'good_fit' }],
});

/** Services whose responses the test resolves by hand, in any order. */
function manualServices() {
  const saves: Array<ReturnType<typeof deferred<SavedServiceArea>>> = [];
  const matches = new Map<string, ReturnType<typeof deferred<AssessmentBatch>>>();
  const signals = new Map<string, AbortSignal>();
  const services: ServiceAreaServices = {
    saveServiceArea() {
      const d = deferred<SavedServiceArea>();
      saves.push(d);
      return d.promise;
    },
    fetchAssessments({ profileRevision }, { signal }) {
      const d = deferred<AssessmentBatch>();
      matches.set(String(profileRevision), d);
      signals.set(String(profileRevision), signal);
      return d.promise;
    },
  };
  return { services, saves, matches, signals };
}

const request = { profileId: 'p', baseRevision: 3, serviceArea: { kind: 'counties', counties: ['King'] } as const };

describe('apply controller', () => {
  it('saves, then recalculates fit for the new revision', async () => {
    const { services, saves, matches } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(3);

    const saving = controller.save(request);
    saves[0].resolve({ profileId: 'p', revision: 4 });
    assert.deepEqual(await saving, { status: 'saved', saved: { profileId: 'p', revision: 4 } });
    assert.equal(controller.isCurrent(4), true);

    const recalculating = controller.recalculate('p', 4);
    matches.get('4')!.resolve(batch(4));
    const outcome = await recalculating;
    assert.equal(outcome.status, 'ok');
  });

  it('drops a late response for an older revision after a newer one is applied', async () => {
    const { services, saves, matches, signals } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(3);

    // Apply #1 -> revision 4, recalculation starts but does not return yet.
    const first = controller.save(request);
    saves[0].resolve({ profileId: 'p', revision: 4 });
    await first;
    const slowRecalc = controller.recalculate('p', 4);

    // Apply #2 -> revision 5 while revision 4's matches are still in flight.
    const second = controller.save({ ...request, baseRevision: 4 });
    saves[1].resolve({ profileId: 'p', revision: 5 });
    await second;
    assert.equal(signals.get('4')!.aborted, true, 'older recalculation is cancelled');
    const fastRecalc = controller.recalculate('p', 5);

    matches.get('5')!.resolve(batch(5));
    matches.get('4')!.resolve(batch(4)); // arrives last
    assert.equal((await fastRecalc).status, 'ok');
    assert.equal((await slowRecalc).status, 'stale');
  });

  it('drops results when the profile changes elsewhere mid-recalculation', async () => {
    const { services, matches } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(4);
    const pending = controller.recalculate('p', 4);
    controller.noteActiveRevision(5); // e.g. capabilities edited in onboarding
    matches.get('4')!.resolve(batch(4));
    assert.equal((await pending).status, 'stale');
  });

  it('drops a response labelled with a different revision than requested', async () => {
    const { services, matches } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(4);
    const pending = controller.recalculate('p', 4);
    matches.get('4')!.resolve(batch(3));
    assert.equal((await pending).status, 'stale');
  });

  it('ignores a lagging report of an older numeric revision', async () => {
    const { services, matches } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(5);
    const pending = controller.recalculate('p', 5);
    controller.noteActiveRevision(4);
    assert.equal(controller.isCurrent(5), true);
    matches.get('5')!.resolve(batch(5));
    assert.equal((await pending).status, 'ok');
  });

  it('compares opaque string revisions by equality', () => {
    const controller = createApplyController(() => manualServices().services);
    controller.noteActiveRevision('rev-b');
    controller.noteActiveRevision('rev-a');
    assert.equal(controller.isCurrent('rev-a'), true);
    assert.equal(controller.isCurrent('rev-b'), false);
  });

  it('reports a save failure with its code and keeps nothing applied', async () => {
    const { services, saves } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(3);
    const saving = controller.save(request);
    saves[0].reject({ code: 'revision_conflict', message: 'Profile changed', retryable: false });
    assert.deepEqual(await saving, {
      status: 'failed',
      error: { code: 'revision_conflict', message: 'Profile changed', retryable: false },
    });
    assert.equal(controller.isCurrent(3), true);
  });

  it('reports a failed recalculation without inventing results', async () => {
    const { services, matches } = manualServices();
    const controller = createApplyController(() => services);
    controller.noteActiveRevision(4);
    const pending = controller.recalculate('p', 4);
    matches.get('4')!.reject(new Error('socket hang up'));
    const outcome = await pending;
    assert.equal(outcome.status, 'failed');
    // Raw internals are not surfaced to the UI.
    assert.equal(outcome.status === 'failed' && outcome.error.code, 'internal_error');
  });

  it('skips recalculation when the shell owns it', async () => {
    const controller = createApplyController(() => ({ saveServiceArea: async () => ({ profileId: 'p', revision: 4 }) }));
    controller.noteActiveRevision(4);
    assert.deepEqual(await controller.recalculate('p', 4), { status: 'skipped' });
  });

  it('aborts in-flight work on dispose', async () => {
    const { services, saves } = manualServices();
    const controller = createApplyController(() => services);
    const saving = controller.save(request);
    controller.dispose();
    saves[0].resolve({ profileId: 'p', revision: 4 });
    assert.deepEqual(await saving, { status: 'aborted' });
  });
});
