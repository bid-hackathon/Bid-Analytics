import type { OpportunityChange } from '../core/comparison';
import type { DateValue, LocationPrecision } from '../core/contract';
import type { OpportunityScope, UnknownLocationReason } from '../core/geography';

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

const PRECISION_LABELS: Record<LocationPrecision | 'multiple', string> = {
  exact_site: 'Exact site',
  address: 'Address',
  road_segment: 'Road segment',
  city: 'City-level',
  county: 'County-level',
  region: 'Regional',
  statewide: 'Statewide',
  remote: 'Remote',
  unknown: 'Unknown',
  multiple: 'Multiple sites',
};

const UNKNOWN_REASONS: Record<UnknownLocationReason, string> = {
  no_location: 'Work location not published',
  precision_unknown: 'Work location unknown',
  county_not_resolved: 'County not identified',
  not_a_washington_county: 'Not matched to a Washington county',
};

export function unknownReasonLabel(reason: UnknownLocationReason): string {
  return UNKNOWN_REASONS[reason];
}

/** ["Pierce County", "County-level"], ["King, Pierce", "Multiple sites"], ["Statewide"]. */
export function locationParts(change: Pick<OpportunityChange, 'scope' | 'viaCounties'>): string[] {
  return scopeParts(change.scope, change.viaCounties);
}

export function scopeParts(scope: OpportunityScope, emphasize: readonly string[] = []): string[] {
  switch (scope.kind) {
    case 'statewide':
      return ['Statewide'];
    case 'remote':
      return ['Remote'];
    case 'unknown':
      return [unknownReasonLabel(scope.reason)];
    case 'counties': {
      const names = emphasize.length > 0 ? emphasize : scope.counties;
      const counties = names.length === 1 ? `${names[0]} County` : names.join(', ');
      const extra = scope.counties.length - names.length;
      const parts = [extra > 0 ? `${counties} +${extra}` : counties, PRECISION_LABELS[scope.precision]];
      if (scope.agencyDerived) parts.push('agency’s county');
      return parts;
    }
  }
}

const dateOnly = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * Date-only deadlines keep no invented hour (SRS §12.5). Timestamps show the
 * source time zone when known, otherwise Pacific time.
 */
export function deadlineLabel(deadline: DateValue | null | undefined): string {
  if (!deadline?.value) return 'Deadline not listed';
  const time = Date.parse(deadline.value);
  if (Number.isNaN(time)) return deadline.rawText ? `Closes ${deadline.rawText}` : 'Deadline not listed';
  if (deadline.precision === 'date') return `Closes ${dateOnly.format(time)}`;
  return `Closes ${dateTimeFormat(deadline.timeZone).format(time)}`;
}

function dateTimeFormat(timeZone: string | null | undefined): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timeZone ?? 'America/Los_Angeles' });
  } catch {
    // Unrecognized source zone: fall back rather than fail the whole list.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'America/Los_Angeles' });
  }
}
