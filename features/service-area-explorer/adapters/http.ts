import type { FitAssessment, ProfileRevision } from '../core/contract';
import { parseProfileServiceArea, toProfileServiceAreaPayload } from '../core/serviceArea';
import type { AssessmentBatch, SaveServiceAreaRequest, ServiceAreaServices, ServiceError } from '../core/services';

export interface HttpServiceAreaOptions {
  /** Defaults to `/api/v1` (SRS §13.1). */
  baseUrl?: string;
  fetch?: typeof fetch;
  /**
   * Builds the PUT /me/profile body. The default sends the full confirmed
   * profile with the new service area and the base revision. Replace it if
   * Workstream C's route takes a patch instead.
   */
  buildProfileBody?: (request: SaveServiceAreaRequest) => unknown;
  /**
   * Builds the POST /matches body. Include the shell's current shared filter
   * object (SRS §13.2) so recalculated results match what the map shows.
   */
  buildMatchBody?: (request: { profileId: string; profileRevision: ProfileRevision }) => unknown;
}

interface Envelope<T> {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: { code?: string; message?: string; retryable?: boolean } | null;
}

function defaultProfileBody(request: SaveServiceAreaRequest) {
  return {
    ...request.vendorProfile,
    id: request.profileId,
    baseRevision: request.baseRevision,
    serviceArea: toProfileServiceAreaPayload(request.serviceArea),
  };
}

/**
 * Default implementation of ServiceAreaServices against the SRS §13 routes and
 * response envelope. Prefer wiring the app's own API client when it exists.
 */
export function createHttpServiceAreaServices(options: HttpServiceAreaOptions = {}): ServiceAreaServices {
  const baseUrl = options.baseUrl ?? '/api/v1';
  const doFetch: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const buildProfileBody = options.buildProfileBody ?? defaultProfileBody;
  const buildMatchBody = options.buildMatchBody ?? (({ profileRevision }) => ({ profileRevision }));

  async function request<T>(path: string, init: RequestInit): Promise<Envelope<T>> {
    const response = await doFetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    let body: Envelope<T> | null = null;
    try {
      body = (await response.json()) as Envelope<T>;
    } catch {
      body = null;
    }
    if (!response.ok || !body || body.error) throw toError(response.status, body?.error);
    return body;
  }

  return {
    async saveServiceArea(req, { signal }) {
      const body = await request<Record<string, unknown>>('/me/profile', {
        method: 'PUT',
        body: JSON.stringify(buildProfileBody(req)),
        signal,
      });
      const data = body.data ?? {};
      const revision = (data.revision ?? data.profileRevision) as ProfileRevision | undefined;
      if (revision == null) throw invalidResponse('The saved profile did not include a revision.');
      return {
        profileId: typeof data.id === 'string' ? data.id : req.profileId,
        revision,
        serviceArea: 'serviceArea' in data ? parseProfileServiceArea(data.serviceArea) : req.serviceArea,
      };
    },

    async fetchAssessments(req, { signal }) {
      const body = await request<FitAssessment[] | { assessments?: FitAssessment[] }>('/matches', {
        method: 'POST',
        body: JSON.stringify(buildMatchBody(req)),
        signal,
      });
      const assessments = Array.isArray(body.data) ? body.data : (body.data?.assessments ?? []);
      const meta = body.meta ?? {};
      const revision = (meta.profileRevision as ProfileRevision | undefined) ?? commonRevision(assessments);
      // Without a revision the response cannot be proven current (REC-07).
      if (revision == null) throw invalidResponse('Match results did not include a profile revision.');
      const batch: AssessmentBatch = {
        profileRevision: revision,
        assessments,
        rankingVersion: (meta.rankingVersion as string | undefined) ?? null,
        assessmentState: (meta.assessmentState as string | undefined) ?? null,
        assessedCount: (meta.assessedCount as number | undefined) ?? null,
        unassessedCount: (meta.unassessedCount as number | undefined) ?? null,
      };
      return batch;
    },
  };
}

function commonRevision(assessments: readonly FitAssessment[]): ProfileRevision | null {
  if (assessments.length === 0) return null;
  const first = String(assessments[0].profileRevision);
  return assessments.every((a) => String(a.profileRevision) === first) ? assessments[0].profileRevision : null;
}

function invalidResponse(message: string): ServiceError {
  return { code: 'internal_error', message, retryable: true };
}

function toError(status: number, error: Envelope<unknown>['error']): ServiceError {
  const fallbackCode =
    status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden' : status === 409 ? 'revision_conflict' : 'internal_error';
  return {
    code: error?.code ?? fallbackCode,
    message: error?.message ?? 'The request could not be completed.',
    retryable: error?.retryable ?? (status >= 500 || status === 429),
  };
}
