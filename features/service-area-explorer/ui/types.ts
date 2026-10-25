import type { ExplorerOpportunity } from '../core/comparison';
import type { ProfileRevision } from '../core/contract';
import type { ServiceError } from '../core/services';

/**
 * The catalog the explorer compares over: the shell's current filters applied,
 * but no county or service-area constraint. `error` is a failed load, which the
 * explorer never presents as an empty result.
 */
export type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message?: string | null }
  | { status: 'ready'; opportunities: readonly ExplorerOpportunity[] };

export type ApplyState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'recalculating'; revision: ProfileRevision }
  /** `fitUpdated` is false when the shell, not the explorer, recomputes fit. */
  | { phase: 'applied'; revision: ProfileRevision; fitUpdated: boolean }
  | { phase: 'save_failed'; error: ServiceError }
  | { phase: 'recalc_failed'; revision: ProfileRevision; error: ServiceError };
