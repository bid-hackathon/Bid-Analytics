import type { OpportunityStatus, PerformanceLocation } from '../core/contract';
import type { ExplorerOpportunity } from '../core/comparison';
import { AGENCY_JURISDICTION_METHOD } from '../core/geography';

/**
 * Row of the `bids` table / `open_bids` view as defined on Workstream C's
 * branch (docs/bid-data-model.md, PR #1). Only the fields this feature reads.
 */
export interface BidRow {
  id: string;
  agency: string | null;
  title: string;
  status?: string | null;
  state?: string | null;
  county?: string | null;
  city?: string | null;
  location_text?: string | null;
  deadline?: string | null;
  updated_at?: string | null;
}

export interface BidRowAdapterOptions {
  /**
   * Where `county` came from. scripts/pull_bids.py currently copies it from the
   * source (agency) record, so the default discloses it as the agency's
   * jurisdiction rather than a confirmed work site. Switch to 'work_location'
   * once the collector extracts place of performance.
   */
  countyBasis?: 'agency_jurisdiction' | 'work_location';
}

export interface BidRowAdapterResult {
  opportunities: ExplorerOpportunity[];
  /** Rows outside Washington are out of scope (SRS D-18) and left out. */
  skippedOutOfState: number;
}

const STATUS: Record<string, OpportunityStatus> = {
  open: 'open',
  closed: 'closed',
  awarded: 'awarded',
  cancelled: 'canceled',
  canceled: 'canceled',
  unknown: 'unknown',
};

/**
 * Maps `bids` rows to the explorer's opportunity shape. `lat`/`lng` are
 * deliberately ignored: the bid model allows them to be the agency's location,
 * which must never stand in for a work site (SRS §4.4).
 */
export function opportunitiesFromBidRows(rows: readonly BidRow[], options: BidRowAdapterOptions = {}): BidRowAdapterResult {
  const countyBasis = options.countyBasis ?? 'agency_jurisdiction';
  const opportunities: ExplorerOpportunity[] = [];
  let skippedOutOfState = 0;

  for (const row of rows) {
    if (row.state && row.state !== 'WA') {
      skippedOutOfState += 1;
      continue;
    }
    const locations: PerformanceLocation[] = [];
    const county = row.county?.trim();
    if (county) {
      locations.push({
        id: `${row.id}:county`,
        label: row.city?.trim() ? `${row.city.trim()}, ${county} County` : `${county} County`,
        precision: row.city?.trim() ? 'city' : 'county',
        countyNames: [county],
        cityName: row.city?.trim() || null,
        rawLocationText: row.location_text ?? null,
        resolutionMethod: countyBasis === 'agency_jurisdiction' ? AGENCY_JURISDICTION_METHOD : 'deterministic_parsing',
      });
    }
    opportunities.push({
      id: row.id,
      version: row.updated_at ?? null,
      title: row.title,
      agencyName: row.agency,
      status: row.status && Object.hasOwn(STATUS, row.status) ? STATUS[row.status] : 'unknown',
      deadline: row.deadline ? { value: row.deadline, precision: 'datetime' } : null,
      locations,
      locationStatus: locations.length > 0 ? 'approximate' : 'unknown',
    });
  }
  return { opportunities, skippedOutOfState };
}
