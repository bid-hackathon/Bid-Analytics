import type { ProfileRevision } from './contract';
import { isOlderRevision, sameRevision } from './revisions';
import { toServiceError } from './services';
import type { AssessmentBatch, SaveServiceAreaRequest, SavedServiceArea, ServiceAreaServices, ServiceError } from './services';

export type SaveOutcome =
  | { status: 'saved'; saved: SavedServiceArea }
  | { status: 'failed'; error: ServiceError }
  | { status: 'aborted' };

export type RecalculateOutcome =
  | { status: 'ok'; batch: AssessmentBatch }
  | { status: 'skipped' }
  | { status: 'failed'; error: ServiceError }
  /** A newer revision became active; the result must not be shown. */
  | { status: 'stale' };

export interface ApplyController {
  /** Report the active confirmed revision; a change cancels older recalculations. */
  noteActiveRevision(revision: ProfileRevision | null | undefined): void;
  isCurrent(revision: ProfileRevision): boolean;
  save(request: SaveServiceAreaRequest): Promise<SaveOutcome>;
  recalculate(profileId: string, revision: ProfileRevision): Promise<RecalculateOutcome>;
  dispose(): void;
}

/**
 * Orchestrates confirm-then-recalculate with revision guards. Responses for a
 * revision other than the latest known one are reported as stale so callers
 * can drop them (SRS §13.6, REC-07). Services are read lazily so the caller
 * may swap implementations between renders.
 */
export function createApplyController(getServices: () => ServiceAreaServices): ApplyController {
  let latest: ProfileRevision | null = null;
  let recalculation: AbortController | null = null;
  const inFlight = new Set<AbortController>();
  let disposed = false;

  function track() {
    const controller = new AbortController();
    inFlight.add(controller);
    return controller;
  }

  function noteActiveRevision(revision: ProfileRevision | null | undefined) {
    if (revision == null || sameRevision(revision, latest)) return;
    // Numeric revisions never move backwards; a lagging report keeps the newer one.
    if (latest != null && isOlderRevision(revision, latest)) return;
    latest = revision;
    recalculation?.abort();
    recalculation = null;
  }

  function isCurrent(revision: ProfileRevision) {
    return !disposed && sameRevision(revision, latest);
  }

  async function save(request: SaveServiceAreaRequest): Promise<SaveOutcome> {
    noteActiveRevision(request.baseRevision);
    const controller = track();
    try {
      const saved = await getServices().saveServiceArea(request, { signal: controller.signal });
      if (controller.signal.aborted) return { status: 'aborted' };
      noteActiveRevision(saved.revision);
      return { status: 'saved', saved };
    } catch (error) {
      if (controller.signal.aborted) return { status: 'aborted' };
      return { status: 'failed', error: toServiceError(error) };
    } finally {
      inFlight.delete(controller);
    }
  }

  async function recalculate(profileId: string, revision: ProfileRevision): Promise<RecalculateOutcome> {
    const services = getServices();
    if (!services.fetchAssessments) return { status: 'skipped' };
    if (!isCurrent(revision)) return { status: 'stale' };

    recalculation?.abort();
    const controller = track();
    recalculation = controller;
    try {
      const batch = await services.fetchAssessments({ profileId, profileRevision: revision }, { signal: controller.signal });
      if (controller.signal.aborted || !isCurrent(revision) || !sameRevision(batch.profileRevision, revision)) {
        return { status: 'stale' };
      }
      return { status: 'ok', batch };
    } catch (error) {
      if (controller.signal.aborted || !isCurrent(revision)) return { status: 'stale' };
      return { status: 'failed', error: toServiceError(error) };
    } finally {
      inFlight.delete(controller);
      if (recalculation === controller) recalculation = null;
    }
  }

  function dispose() {
    disposed = true;
    for (const controller of inFlight) controller.abort();
    inFlight.clear();
  }

  return { noteActiveRevision, isCurrent, save, recalculate, dispose };
}
