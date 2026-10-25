'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createApplyController } from '../core/applyController';
import type { ApplyController } from '../core/applyController';
import { indexCurrentAssessments } from '../core/assessments';
import type { FitDisplay } from '../core/assessments';
import { compareServiceAreas } from '../core/comparison';
import type { ServiceAreaComparison } from '../core/comparison';
import type { FitAssessment, ProfileRevision } from '../core/contract';
import { normalizeCountyName } from '../core/counties';
import type { WashingtonCountyName } from '../core/counties';
import {
  INITIAL_DRAFT_STATE,
  baselineMovedDuringDraft,
  draftReducer,
  effectiveBaseline,
  effectiveDraft,
  isDirty,
} from '../core/draft';
import { buildMapHighlight } from '../core/highlight';
import type { ServiceAreaMapHighlight } from '../core/highlight';
import { sameRevision } from '../core/revisions';
import { isEmptySelection } from '../core/serviceArea';
import type { ExplorerProfile, ProfileServiceArea, ServiceAreaSelection } from '../core/serviceArea';
import type { AssessmentBatch, SavedServiceArea, ServiceAreaServices } from '../core/services';
import type { ApplyState, CatalogState } from './types';

export interface UseServiceAreaExplorerOptions {
  /** Active confirmed profile, or null before onboarding is complete. */
  profile: ExplorerProfile | null;
  catalog: CatalogState;
  /** The shell's current assessments; only those for the active revision are used. */
  assessments?: readonly FitAssessment[];
  services: ServiceAreaServices;
  /** Called after a confirmed save. Make this the active profile (new revision). */
  onProfileSaved: (saved: SavedServiceArea & { serviceArea: ProfileServiceArea }) => void;
  /** Recalculated fit for the saved revision. Never called with a stale revision. */
  onAssessmentsLoaded?: (batch: AssessmentBatch) => void;
  /** A response arrived for a revision that is no longer active and was dropped. */
  onStaleResponse?: (info: { revision: ProfileRevision }) => void;
  /** Mirrors the shared filter's `includeStatewide`. Defaults to true. */
  includeStatewide?: boolean;
}

/** State and actions the presentational component renders. */
export interface ServiceAreaExplorerState {
  profile: ExplorerProfile | null;
  catalog: CatalogState;
  baseline: ProfileServiceArea;
  draft: ServiceAreaSelection;
  isExploring: boolean;
  profileChangedDuringDraft: boolean;
  comparison: ServiceAreaComparison | null;
  fit: ReadonlyMap<string, FitDisplay>;
  applyState: ApplyState;
  onToggleCounty: (county: WashingtonCountyName) => void;
  onSetStatewide: (enabled: boolean) => void;
  onClear: () => void;
  onCancel: () => void;
  onApply: () => void;
  onRetryRecalc: () => void;
  onFocusOpportunity: (opportunityId: string | null) => void;
}

export interface ServiceAreaExplorerController {
  /** Spread into <ServiceAreaExplorer />. */
  viewProps: ServiceAreaExplorerState;
  /** Pass to the map; it draws counties and markers from this. */
  highlight: ServiceAreaMapHighlight;
  /** For county clicks on the map. Accepts any county spelling; ignores non-Washington names. */
  toggleCounty: (county: string) => void;
  cancel: () => void;
  isExploring: boolean;
}

const IDLE: ApplyState = { phase: 'idle' };
const UNSET: ProfileServiceArea = { kind: 'unset' };
const NO_ASSESSMENTS: readonly FitAssessment[] = [];
const NO_FIT: ReadonlyMap<string, FitDisplay> = new Map();

function clearTransient(state: ApplyState): ApplyState {
  return state.phase === 'applied' || state.phase === 'save_failed' ? IDLE : state;
}

/**
 * Local exploration state for the Service Area Explorer. Lives in the
 * component that owns the map so both can read the same draft; it adds no
 * global store. A draft only reaches the profile through `onApply`.
 */
export function useServiceAreaExplorer(options: UseServiceAreaExplorerOptions): ServiceAreaExplorerController {
  const { profile, catalog, assessments = NO_ASSESSMENTS, includeStatewide = true } = options;
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const [state, dispatch] = useReducer(draftReducer, INITIAL_DRAFT_STATE);
  const [applyState, setApplyState] = useState<ApplyState>(IDLE);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const controllerRef = useRef<ApplyController | null>(null);

  useEffect(() => {
    const controller = createApplyController(() => latest.current.services);
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, []);

  const profileRevision = profile?.revision ?? null;
  useEffect(() => {
    controllerRef.current?.noteActiveRevision(profileRevision);
    dispatch({ type: 'profile_revision_changed' });
  }, [profileRevision]);

  // A saved revision stays active locally until the shell passes it back in.
  const activeRevision = state.pendingSaved?.revision ?? profileRevision;
  const baseline = effectiveBaseline(state, profile?.serviceArea ?? UNSET);
  const draft = effectiveDraft(state, baseline);
  const isExploring = isDirty(state, baseline);
  const saving = applyState.phase === 'saving';
  const opportunities = catalog.status === 'ready' ? catalog.opportunities : null;

  const comparison = useMemo(
    () => (opportunities ? compareServiceAreas({ opportunities, baseline, draft, policy: { includeStatewide } }) : null),
    [opportunities, baseline, draft, includeStatewide],
  );

  const fit = useMemo(
    () => (profile ? indexCurrentAssessments(assessments, profile.revision, opportunities ?? []) : NO_FIT),
    [assessments, profile, opportunities],
  );

  const highlight = useMemo(
    () => buildMapHighlight({ baseline, draft, exploring: isExploring, comparison, focusedOpportunityId: focusedId }),
    [baseline, draft, isExploring, comparison, focusedId],
  );

  const toggleCounty = useCallback(
    (name: string) => {
      const county = normalizeCountyName(name);
      if (!county || saving || !profile) return;
      dispatch({ type: 'toggle_county', county, baseline, revision: activeRevision });
      setApplyState(clearTransient);
    },
    [saving, profile, baseline, activeRevision],
  );

  const setStatewide = useCallback(
    (enabled: boolean) => {
      if (saving || !profile) return;
      dispatch({ type: 'set_statewide', enabled, baseline, revision: activeRevision });
      setApplyState(clearTransient);
    },
    [saving, profile, baseline, activeRevision],
  );

  const clear = useCallback(() => {
    if (saving || !profile) return;
    dispatch({ type: 'clear', baseline, revision: activeRevision });
    setApplyState(clearTransient);
  }, [saving, profile, baseline, activeRevision]);

  const cancel = useCallback(() => {
    if (saving) return;
    dispatch({ type: 'cancel' });
    setApplyState(clearTransient);
    setFocusedId(null);
  }, [saving]);

  const recalculate = useCallback(async (controller: ApplyController, profileId: string, revision: ProfileRevision) => {
    const isThisRun = (s: ApplyState) => s.phase === 'recalculating' && sameRevision(s.revision, revision);
    setApplyState({ phase: 'recalculating', revision });
    const outcome = await controller.recalculate(profileId, revision);
    if (controllerRef.current !== controller) return;
    switch (outcome.status) {
      case 'ok':
        latest.current.onAssessmentsLoaded?.(outcome.batch);
        setApplyState((s) => (isThisRun(s) ? { phase: 'applied', revision, fitUpdated: true } : s));
        break;
      case 'skipped':
        setApplyState((s) => (isThisRun(s) ? { phase: 'applied', revision, fitUpdated: false } : s));
        break;
      case 'failed':
        setApplyState((s) => (isThisRun(s) ? { phase: 'recalc_failed', revision, error: outcome.error } : s));
        break;
      case 'stale':
        latest.current.onStaleResponse?.({ revision });
        setApplyState((s) => (isThisRun(s) ? IDLE : s));
        break;
    }
  }, []);

  const apply = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller || !profile || activeRevision == null || !isExploring || isEmptySelection(draft) || saving) return;
    setApplyState({ phase: 'saving' });
    const outcome = await controller.save({
      profileId: profile.profileId,
      baseRevision: activeRevision,
      serviceArea: draft,
      vendorProfile: profile.vendorProfile,
    });
    if (outcome.status === 'aborted' || controllerRef.current !== controller) return;
    if (outcome.status === 'failed') {
      setApplyState({ phase: 'save_failed', error: outcome.error });
      return;
    }
    const saved = { ...outcome.saved, serviceArea: outcome.saved.serviceArea ?? draft };
    dispatch({ type: 'saved', revision: saved.revision, serviceArea: saved.serviceArea });
    setFocusedId(null);
    latest.current.onProfileSaved(saved);
    await recalculate(controller, saved.profileId, saved.revision);
  }, [profile, activeRevision, isExploring, draft, saving, recalculate]);

  const retryRecalc = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller || !profile || applyState.phase !== 'recalc_failed') return;
    void recalculate(controller, profile.profileId, applyState.revision);
  }, [profile, applyState, recalculate]);

  const viewProps: ServiceAreaExplorerState = {
    profile,
    catalog,
    baseline,
    draft,
    isExploring,
    profileChangedDuringDraft: baselineMovedDuringDraft(state, activeRevision),
    comparison,
    fit,
    applyState,
    onToggleCounty: toggleCounty,
    onSetStatewide: setStatewide,
    onClear: clear,
    onCancel: cancel,
    onApply: () => void apply(),
    onRetryRecalc: retryRecalc,
    onFocusOpportunity: setFocusedId,
  };

  return { viewProps, highlight, toggleCounty, cancel, isExploring };
}
