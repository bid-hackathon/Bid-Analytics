/**
 * SIMULATED SERVICES FOR THE DEMO HARNESS ONLY. Not a matcher.
 *
 * Stands in for Workstream C's profile route and Workstream B's matching so
 * the apply, recalculate and stale-response paths can be exercised. Fit tiers
 * come from a fixed synthetic table. Opportunities outside the saved area get
 * "Not a fit" to mimic a service-area conflict.
 */
import type { FitAssessment, FitTier } from '../core/contract';
import { isIncluded, resolveScope } from '../core/geography';
import type { ExplorerOpportunity } from '../core/comparison';
import { sameRevision } from '../core/revisions';
import type { ServiceAreaSelection } from '../core/serviceArea';
import type { ServiceAreaServices } from '../core/services';

export interface DemoSwitches {
  failSave: boolean;
  failMatching: boolean;
  slowMatching: boolean;
}

/** The pretend server's copy of the profile. */
export interface DemoServerProfile {
  revision: number;
  serviceArea: ServiceAreaSelection;
}

const SYNTHETIC_TIERS: Readonly<Record<string, FitTier | 'pending'>> = {
  'dev-fixture-01': 'good_fit',
  'dev-fixture-02': 'possible_fit',
  'dev-fixture-03': 'needs_review',
  'dev-fixture-04': 'good_fit',
  'dev-fixture-05': 'possible_fit',
  'dev-fixture-06': 'possible_fit',
  'dev-fixture-10': 'good_fit',
  'dev-fixture-11': 'possible_fit',
  'dev-fixture-12': 'possible_fit',
  'dev-fixture-13': 'pending',
  'dev-fixture-14': 'possible_fit',
  'dev-fixture-15': 'good_fit',
  '00000000-0000-0000-0000-000000000001': 'good_fit',
  '00000000-0000-0000-0000-000000000002': 'not_a_fit',
};

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });
}

export function createDemoServices(options: {
  server: DemoServerProfile;
  catalog: () => readonly ExplorerOpportunity[];
  switches: () => DemoSwitches;
}): ServiceAreaServices {
  const { server } = options;
  return {
    async saveServiceArea(request, { signal }) {
      await wait(650, signal);
      if (options.switches().failSave) {
        throw { code: 'internal_error', message: 'Simulated save failure. Nothing was changed.', retryable: true };
      }
      if (!sameRevision(request.baseRevision, server.revision)) {
        throw { code: 'revision_conflict', message: 'Profile revision changed.', retryable: false };
      }
      server.revision += 1;
      server.serviceArea = request.serviceArea;
      return { profileId: request.profileId, revision: server.revision, serviceArea: request.serviceArea };
    },

    async fetchAssessments({ profileRevision }, { signal }) {
      const area = server.serviceArea;
      await wait(options.switches().slowMatching ? 3500 : 800, signal);
      if (options.switches().failMatching) {
        throw { code: 'ai_unavailable', message: 'Simulated matching outage.', retryable: true };
      }
      const assessments = options.catalog().flatMap((opportunity): FitAssessment[] => {
        const tier = SYNTHETIC_TIERS[opportunity.id];
        if (!tier) return [];
        if (tier === 'pending') return [{ opportunityId: opportunity.id, profileRevision, state: 'pending' }];
        const inArea = isIncluded(resolveScope(opportunity), area, { includeStatewide: true });
        return [{ opportunityId: opportunity.id, profileRevision, state: 'assessed', tier: inArea ? tier : 'not_a_fit' }];
      });
      return { profileRevision, assessments, rankingVersion: 'demo-synthetic' };
    },
  };
}
