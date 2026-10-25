/**
 * Structural subset of the shared data contract (SRS §12) that the Service Area
 * Explorer reads. Field names follow SRS §12.4 Opportunity, §12.5 DateValue,
 * §12.6 PerformanceLocation and §12.9 FitAssessment, so canonical records
 * satisfy these types without mapping.
 *
 * When the shared schema types land in the app, replace these declarations with
 * imports from there instead of extending them here. Workstream C owns the
 * opportunity schema and Workstream B owns the fit schema.
 */

/** Opaque profile revision. Numeric revisions additionally get ordering checks. */
export type ProfileRevision = string | number;

export type LocationPrecision =
  | 'exact_site'
  | 'address'
  | 'road_segment'
  | 'city'
  | 'county'
  | 'region'
  | 'statewide'
  | 'remote'
  | 'unknown';

export type LocationStatus = 'located' | 'approximate' | 'multiple' | 'statewide' | 'remote' | 'unknown';

export type OpportunityStatus = 'open' | 'closed' | 'awarded' | 'canceled' | 'forecast' | 'unknown';

export interface DateValue {
  rawText?: string | null;
  value: string | null;
  precision: 'date' | 'datetime';
  timeZone?: string | null;
}

export interface PerformanceLocation {
  id: string;
  label?: string | null;
  precision: LocationPrecision;
  countyNames?: readonly string[] | null;
  cityName?: string | null;
  displayPointBasis?: string | null;
  rawLocationText?: string | null;
  resolutionMethod?: string | null;
}

export interface Opportunity {
  id: string;
  version?: string | number | null;
  title: string;
  agencyId?: string | null;
  status?: OpportunityStatus | null;
  deadline?: DateValue | null;
  locations: readonly PerformanceLocation[];
  locationStatus: LocationStatus;
}

export type FitTier = 'good_fit' | 'possible_fit' | 'not_a_fit' | 'needs_review';

export type AssessmentState = 'assessed' | 'pending' | 'unavailable';

export interface FitAssessment {
  opportunityId: string;
  opportunityVersion?: string | number | null;
  profileId?: string | null;
  profileRevision: ProfileRevision;
  state: AssessmentState;
  /** Workstream B owns the enum spelling; read it through normalizeFitTier. */
  tier?: string | null;
}
