import type { FitAssessment, ProfileRevision } from './contract';
import type { ProfileServiceArea, ServiceAreaSelection } from './serviceArea';

/** Error shape from SRS §13.5. `code` includes `revision_conflict` and `unauthenticated`. */
export interface ServiceError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SaveServiceAreaRequest {
  profileId: string;
  /** Revision the edit was made against, for optimistic concurrency. */
  baseRevision: ProfileRevision;
  serviceArea: ServiceAreaSelection;
  vendorProfile?: Readonly<Record<string, unknown>>;
}

export interface SavedServiceArea {
  profileId: string;
  /** New confirmed revision. */
  revision: ProfileRevision;
  /** Service area as stored; defaults to the requested one when the response omits it. */
  serviceArea?: ProfileServiceArea;
}

export interface AssessmentBatch {
  profileRevision: ProfileRevision;
  assessments: readonly FitAssessment[];
  rankingVersion?: string | null;
  assessmentState?: string | null;
  assessedCount?: number | null;
  unassessedCount?: number | null;
}

/**
 * What the explorer needs from the app's API layer. Implement by delegating to
 * the shell's existing client (see adapters/http.ts for a default against the
 * SRS §13 routes).
 */
export interface ServiceAreaServices {
  /** Confirms the edit as a new profile revision (PUT /api/v1/me/profile). */
  saveServiceArea(request: SaveServiceAreaRequest, options: { signal: AbortSignal }): Promise<SavedServiceArea>;
  /**
   * Recomputes personalized fit for a confirmed revision (POST /api/v1/matches).
   * Omit it when the shell already refetches matches on every revision change.
   */
  fetchAssessments?(
    request: { profileId: string; profileRevision: ProfileRevision },
    options: { signal: AbortSignal },
  ): Promise<AssessmentBatch>;
}

export function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ServiceError>;
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

/** Normalizes anything thrown by an adapter without exposing raw internals. */
export function toServiceError(error: unknown): ServiceError {
  if (isServiceError(error)) return { code: error.code, message: error.message, retryable: error.retryable ?? false };
  return { code: 'internal_error', message: 'Something went wrong. Try again.', retryable: true };
}
