import type { ProfileRevision } from './contract';

export function sameRevision(a: ProfileRevision | null | undefined, b: ProfileRevision | null | undefined): boolean {
  return a != null && b != null && String(a) === String(b);
}

function asOrdinal(revision: ProfileRevision): number | null {
  if (typeof revision === 'number') return Number.isFinite(revision) ? revision : null;
  return /^\d+$/.test(revision) ? Number(revision) : null;
}

/**
 * True only when both revisions are numeric and `candidate` is older. Opaque
 * revision IDs cannot be ordered, so callers fall back to equality checks.
 */
export function isOlderRevision(candidate: ProfileRevision, reference: ProfileRevision): boolean {
  const a = asOrdinal(candidate);
  const b = asOrdinal(reference);
  return a !== null && b !== null && a < b;
}
