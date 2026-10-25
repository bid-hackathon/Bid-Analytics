// Public surface of the Service Area Explorer. Import from here, not deep paths.

export { ServiceAreaExplorer } from './ui/ServiceAreaExplorer';
export type { ServiceAreaExplorerProps } from './ui/ServiceAreaExplorer';
export { useServiceAreaExplorer } from './ui/useServiceAreaExplorer';
export type {
  ServiceAreaExplorerController,
  ServiceAreaExplorerState,
  UseServiceAreaExplorerOptions,
} from './ui/useServiceAreaExplorer';
export type { ApplyState, CatalogState } from './ui/types';

export type { ServiceAreaMapHighlight, CountyHighlightState } from './core/highlight';
export type {
  ServiceAreaServices,
  SaveServiceAreaRequest,
  SavedServiceArea,
  AssessmentBatch,
  ServiceError,
} from './core/services';
export type {
  ExplorerProfile,
  ProfileServiceArea,
  ServiceAreaSelection,
} from './core/serviceArea';
export { parseProfileServiceArea, toProfileServiceAreaPayload } from './core/serviceArea';
export type { ExplorerOpportunity, ServiceAreaComparison, OpportunityChange, AreaTally } from './core/comparison';
export { compareServiceAreas } from './core/comparison';
export type { OpportunityScope } from './core/geography';
export { AGENCY_JURISDICTION_METHOD, resolveScope } from './core/geography';
export { WASHINGTON_COUNTIES, normalizeCountyName } from './core/counties';
export type { WashingtonCountyName } from './core/counties';
export type * from './core/contract';

export { createHttpServiceAreaServices } from './adapters/http';
export { opportunitiesFromBidRows } from './adapters/bidRow';
export type { BidRow } from './adapters/bidRow';
