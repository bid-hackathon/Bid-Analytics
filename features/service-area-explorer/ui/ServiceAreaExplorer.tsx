'use client';

import { Fragment, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { fitFor, tallyFit } from '../core/assessments';
import type { FitDisplay } from '../core/assessments';
import type { ExplorerOpportunity, OpportunityChange, ServiceAreaComparison } from '../core/comparison';
import { sortCounties } from '../core/counties';
import type { WashingtonCountyName } from '../core/counties';
import { isEmptySelection, profileAreaLabel, selectedCounties, selectionFromProfile } from '../core/serviceArea';
import { CountyPicker } from './CountyPicker';
import { cx, deadlineLabel, locationParts, plural, unknownReasonLabel } from './format';
import type { ServiceAreaExplorerState } from './useServiceAreaExplorer';
import styles from './ServiceAreaExplorer.module.css';

export interface ServiceAreaExplorerProps extends ServiceAreaExplorerState {
  /** Opens the shell's detail panel for a canonical opportunity ID. */
  onSelectOpportunity: (opportunityId: string) => void;
  /** When given, titles render as links (e.g. standalone detail routes). */
  getOpportunityHref?: (opportunityId: string) => string;
  onRetryCatalog?: () => void;
  /** Shown when there is no confirmed profile yet. */
  onStartProfile?: () => void;
  title?: string;
  className?: string;
}

const COLLAPSED_CHIP_LIMIT = 12;

/**
 * Controlled Service Area Explorer panel. Pair it with useServiceAreaExplorer,
 * or drive every prop from the shell's own state.
 */
export function ServiceAreaExplorer(props: ServiceAreaExplorerProps) {
  const { profile, applyState, isExploring, title = 'Service area', className } = props;
  const headingId = useId();
  const saving = applyState.phase === 'saving';

  return (
    <section
      className={cx(styles.root, className)}
      aria-labelledby={headingId}
      aria-busy={saving || undefined}
      data-exploring={isExploring || undefined}
    >
      <header>
        <div className={styles.header}>
          <h2 id={headingId} className={styles.title}>
            {title}
          </h2>
          <StatusBadge {...props} />
        </div>
        <p className={styles.subtitle}>
          {!profile
            ? 'Where your business can work'
            : isExploring
              ? `Confirmed: ${profileAreaLabel(props.baseline)}`
              : 'Counties where your business can work'}
        </p>
      </header>

      {profile ? <ExplorerBody {...props} /> : <NoProfile onStartProfile={props.onStartProfile} />}
      <LiveRegion {...props} />
    </section>
  );
}

function ExplorerBody(props: ServiceAreaExplorerProps) {
  const { draft, comparison, applyState, isExploring, onToggleCounty, onSetStatewide } = props;
  const saving = applyState.phase === 'saving';
  const selected = new Set(selectedCounties(draft));

  return (
    <>
      <BaselineNotice {...props} />

      <div className={styles.controls}>
        <CountyPicker selected={selected} stats={comparison?.countyStats ?? null} disabled={saving} onToggle={onToggleCounty} />
        <label className={styles.switchRow}>
          <span>All of Washington</span>
          <button
            type="button"
            role="switch"
            aria-checked={draft.kind === 'statewide'}
            className={styles.switch}
            disabled={saving}
            onClick={() => onSetStatewide(draft.kind !== 'statewide')}
          >
            <span className={styles.switchThumb} />
          </button>
        </label>
      </div>

      <CountyChips {...props} />

      <div className={styles.section}>
        <Summary {...props} />
      </div>

      {isExploring && comparison && comparison.catalogSize > 0 && <ChangeLists {...props} comparison={comparison} />}
      {comparison && <UnplacedWork {...props} comparison={comparison} />}

      <Footer {...props} />
    </>
  );
}

function StatusBadge({ applyState, isExploring }: ServiceAreaExplorerProps) {
  let content: ReactNode = null;
  let tone = styles.badgeNeutral;
  if (applyState.phase === 'saving') content = 'Saving…';
  else if (isExploring) {
    content = 'Preview · not saved';
    tone = styles.badgeExploring;
  } else if (applyState.phase === 'recalculating') content = 'Updating fit…';
  else if (applyState.phase === 'applied') {
    content = 'Saved';
    tone = styles.badgeSaved;
  }
  if (!content) return null;
  return <span className={cx(styles.badge, tone)}>{content}</span>;
}

function NoProfile({ onStartProfile }: { onStartProfile?: () => void }) {
  return (
    <div className={styles.emptyState}>
      <p className={styles.emptyTitle}>No confirmed business profile yet</p>
      <p className={styles.muted}>Confirm your profile to set and explore the counties you serve.</p>
      {onStartProfile && (
        <button type="button" className={styles.buttonPrimary} onClick={onStartProfile}>
          Set up profile
        </button>
      )}
    </div>
  );
}

function BaselineNotice({ baseline, profileChangedDuringDraft }: ServiceAreaExplorerProps) {
  if (profileChangedDuringDraft) {
    return (
      <p className={cx(styles.notice, styles.noticeWarning)} role="status">
        Your profile was updated elsewhere while you were exploring. Counts now compare against the latest confirmed area.
      </p>
    );
  }
  if (baseline.kind === 'unsupported') {
    return (
      <p className={styles.notice}>
        Your confirmed area is <strong>{baseline.description}</strong>, which can’t be compared county by county. Applying
        counties here replaces it.
      </p>
    );
  }
  if (baseline.kind === 'unset') {
    return <p className={styles.notice}>No service area is set yet. Add the counties you can work in.</p>;
  }
  return null;
}

function CountyChips({ baseline, draft, isExploring, applyState, onToggleCounty, onSetStatewide, onClear }: ServiceAreaExplorerProps) {
  const [expanded, setExpanded] = useState(false);
  const saving = applyState.phase === 'saving';
  const confirmed = selectionFromProfile(baseline);
  const before = new Set(selectedCounties(confirmed));

  if (draft.kind === 'statewide') {
    return (
      <ul className={styles.chips} aria-label="Selected service area">
        <Chip
          label="All of Washington"
          kind={confirmed.kind === 'statewide' ? 'current' : 'added'}
          disabled={saving}
          actionLabel="Remove all of Washington"
          onAction={() => onSetStatewide(false)}
        />
      </ul>
    );
  }

  const after = new Set(draft.counties);
  const removed = isExploring ? [...before].filter((c) => !after.has(c)) : [];
  const names = sortCounties([...draft.counties, ...removed]);
  if (names.length === 0) {
    return <p className={cx(styles.chipsEmpty, styles.muted)}>No counties selected.</p>;
  }
  const visible = expanded ? names : names.slice(0, COLLAPSED_CHIP_LIMIT);

  return (
    <div className={styles.chipsBlock}>
      <ul className={styles.chips} aria-label="Selected counties">
        {visible.map((name) => {
          const kind = !after.has(name) ? 'removed' : before.has(name) || !isExploring ? 'current' : 'added';
          return (
            <Chip
              key={name}
              label={name}
              kind={kind}
              disabled={saving}
              actionLabel={kind === 'removed' ? `Restore ${name} County` : `Remove ${name} County`}
              onAction={() => onToggleCounty(name as WashingtonCountyName)}
            />
          );
        })}
        {names.length > COLLAPSED_CHIP_LIMIT && (
          <li>
            <button type="button" className={styles.chipMore} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? 'Show fewer' : `+${names.length - COLLAPSED_CHIP_LIMIT} more`}
            </button>
          </li>
        )}
      </ul>
      {draft.counties.length > 1 && (
        <button type="button" className={styles.linkButton} onClick={onClear} disabled={saving}>
          Clear all
        </button>
      )}
    </div>
  );
}

function Chip(props: {
  label: string;
  kind: 'current' | 'added' | 'removed';
  disabled: boolean;
  actionLabel: string;
  onAction: () => void;
}) {
  const { label, kind, disabled, actionLabel, onAction } = props;
  return (
    <li className={cx(styles.chip, kind === 'added' && styles.chipAdded, kind === 'removed' && styles.chipRemoved)}>
      <span className={styles.chipLabel}>
        {kind === 'added' && <span aria-hidden="true">+ </span>}
        {label}
        {kind !== 'current' && <span className={styles.srOnly}>{kind === 'added' ? ' (added in preview)' : ' (removed in preview)'}</span>}
      </span>
      <button type="button" className={styles.chipAction} aria-label={actionLabel} title={actionLabel} disabled={disabled} onClick={onAction}>
        {kind === 'removed' ? (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3.5 4.5h4a2.25 2.25 0 0 1 0 4.5H5.5M3.5 4.5 5.25 2.75M3.5 4.5l1.75 1.75" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m3.5 3.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </li>
  );
}

function Summary(props: ServiceAreaExplorerProps) {
  const { catalog, comparison, isExploring, draft, onRetryCatalog } = props;

  if (catalog.status === 'loading') {
    return (
      <div className={styles.skeleton} aria-label="Loading opportunities" role="status">
        <span className={styles.skeletonLine} style={{ width: '40%' }} />
        <span className={styles.skeletonBlock} />
        <span className={styles.skeletonLine} style={{ width: '70%' }} />
      </div>
    );
  }
  if (catalog.status === 'error' || !comparison) {
    return (
      <div className={cx(styles.notice, styles.noticeError)} role="alert">
        <p className={styles.noticeTitle}>Couldn’t load opportunities</p>
        <p>{catalog.status === 'error' && catalog.message ? catalog.message : 'Counts are unavailable. This is a loading problem, not an empty result.'}</p>
        {onRetryCatalog && (
          <button type="button" className={styles.buttonSecondary} onClick={onRetryCatalog}>
            Try again
          </button>
        )}
      </div>
    );
  }
  if (comparison.catalogSize === 0) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>No open opportunities to compare</p>
        <p className={styles.muted}>The catalog has no open opportunities for your current filters. Changing counties won’t add any.</p>
      </div>
    );
  }

  const { before, after, added, removed, baselineComparable } = comparison;
  return (
    <div className={styles.summary}>
      {isExploring ? (
        <>
          <div className={styles.compare}>
            <Stat label="Confirmed" value={baselineComparable ? before.included : null} />
            <svg className={styles.compareArrow} viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h9.5m-3.5-3.5L12.5 8 9 11.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <Stat label="With changes" value={after.included} emphasized />
          </div>
          <div className={styles.deltas}>
            {!baselineComparable ? (
              <span className={styles.delta}>Replaces your current area</span>
            ) : added.length === 0 && removed.length === 0 ? (
              <span className={styles.delta}>No change in opportunities</span>
            ) : (
              <>
                {added.length > 0 && <span className={cx(styles.delta, styles.deltaAdded)}>+{added.length} new</span>}
                {removed.length > 0 && <span className={cx(styles.delta, styles.deltaRemoved)}>−{removed.length} dropped</span>}
              </>
            )}
          </div>
        </>
      ) : (
        <div className={cx(styles.stat, styles.statEmphasized)}>
          <span className={styles.statLabel}>In your service area</span>
          <span className={styles.statLine}>
            <span key={after.included} className={styles.statValue}>
              {after.included}
            </span>
            <span className={styles.ofTotal}>of {plural(comparison.catalogSize, 'open opportunity', 'open opportunities')}</span>
          </span>
        </div>
      )}
      <SummaryNotes comparison={comparison} emptyDraft={isEmptySelection(draft)} />
    </div>
  );
}

function Stat({ label, value, emphasized }: { label: string; value: number | null; emphasized?: boolean }) {
  return (
    <div className={cx(styles.stat, emphasized && styles.statEmphasized)}>
      <span className={styles.statLabel}>{label}</span>
      {/* Keyed on value so each change replays the entry transition. */}
      <span key={value ?? 'none'} className={styles.statValue}>
        {value ?? '—'}
      </span>
    </div>
  );
}

function SummaryNotes({ comparison, emptyDraft }: { comparison: ServiceAreaComparison; emptyDraft: boolean }) {
  const { after } = comparison;
  const notes: ReactNode[] = [];
  if (emptyDraft) notes.push('Choose at least one county to see opportunities in your area.');
  else if (after.included === 0) notes.push('No open opportunities in these counties right now.');
  if (after.includedStatewide > 0) {
    notes.push(`Includes ${plural(after.includedStatewide, 'statewide opportunity', 'statewide opportunities')}, which can occur anywhere in Washington.`);
  }
  if (after.includedAgencyDerived > 0) {
    notes.push(`${after.includedAgencyDerived} placed by the issuing agency’s county; the work site isn’t confirmed.`);
  }
  if (after.outsideWithUnresolvedSites > 0) {
    notes.push(`${after.outsideWithUnresolvedSites} outside your area also list sites with no known county.`);
  }
  if (comparison.duplicateIdsIgnored > 0) {
    notes.push(`${plural(comparison.duplicateIdsIgnored, 'repeated record')} counted once.`);
  }
  if (notes.length === 0) return null;
  return (
    <ul className={styles.notes}>
      {notes.map((note, i) => (
        <li key={i}>{note}</li>
      ))}
    </ul>
  );
}

type ListTab = 'added' | 'removed';

function ChangeLists(props: ServiceAreaExplorerProps & { comparison: ServiceAreaComparison }) {
  const { comparison, fit } = props;
  const [chosen, setChosen] = useState<ListTab | null>(null);
  const tabsId = useId();
  const { added, removed } = comparison;
  const tab: ListTab = chosen ?? (added.length > 0 || removed.length === 0 ? 'added' : 'removed');
  const removedFit = tallyFit(fit, removed.map((c) => c.opportunity.id));
  const lostAssessed = [
    removedFit.good_fit && `${removedFit.good_fit} Good fit`,
    removedFit.possible_fit && `${removedFit.possible_fit} Possible fit`,
  ].filter(Boolean);
  const addedNote = (
    <p className={styles.listNote}>Within the draft area geographically. Fit for your business is assessed only after you apply.</p>
  );

  // A radius or drawn area can't be diffed by county, so list what the counties include.
  if (!comparison.baselineComparable) {
    return (
      <div className={styles.section}>
        <p className={styles.listHeading}>In the selected counties · {added.length}</p>
        {addedNote}
        <OpportunityList changes={added} actions={props} />
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.segmented} role="tablist" aria-label="Opportunity changes" data-tab={tab}>
        <span className={styles.segmentIndicator} aria-hidden="true" />
        {(['added', 'removed'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${tabsId}-${key}`}
            aria-selected={tab === key}
            aria-controls={`${tabsId}-panel`}
            className={styles.segment}
            onClick={() => setChosen(key)}
          >
            {key === 'added' ? 'Newly included' : 'No longer included'}
            <span className={styles.segmentCount}>{key === 'added' ? added.length : removed.length}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
        {tab === 'added' ? (
          <>
            {addedNote}
            {added.length === 0 ? (
              <p className={styles.listEmpty}>These counties don’t add any open opportunities.</p>
            ) : (
              // Deliberately no fit tag: current assessments predate this area.
              <OpportunityList changes={added} actions={props} />
            )}
          </>
        ) : (
          <>
            {lostAssessed.length > 0 && <p className={styles.listNote}>Includes {lostAssessed.join(' and ')} for your current profile.</p>}
            {removed.length === 0 ? (
              <p className={styles.listEmpty}>Nothing currently in your area would drop out.</p>
            ) : (
              <OpportunityList changes={removed} actions={props} renderFit={(id) => <FitTag fit={fitFor(fit, id)} />} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

type RowActions = Pick<ServiceAreaExplorerProps, 'onSelectOpportunity' | 'getOpportunityHref' | 'onFocusOpportunity'>;

function OpportunityList(props: {
  changes: readonly OpportunityChange[];
  actions: RowActions;
  renderFit?: (opportunityId: string) => ReactNode;
}) {
  const { changes, actions, renderFit } = props;
  return (
    <ul className={styles.list}>
      {changes.map((change, index) => (
        <OpportunityRow
          key={change.opportunity.id}
          opportunity={change.opportunity}
          location={locationParts(change)}
          index={index}
          trailing={renderFit?.(change.opportunity.id)}
          actions={actions}
        />
      ))}
    </ul>
  );
}

/** Joins phrases with middots; lines break between phrases, never inside one. */
function Phrases({ parts }: { parts: readonly string[] }) {
  return parts.map((part, i) => (
    <Fragment key={i}>
      {i > 0 && ' · '}
      <span className={styles.phrase}>{part}</span>
    </Fragment>
  ));
}

function OpportunityRow(props: {
  opportunity: ExplorerOpportunity;
  location: readonly string[];
  index: number;
  trailing?: ReactNode;
  actions: RowActions;
}) {
  const { opportunity, location, index, trailing } = props;
  const { onSelectOpportunity, getOpportunityHref, onFocusOpportunity } = props.actions;
  const focus = () => onFocusOpportunity(opportunity.id);
  const blur = () => onFocusOpportunity(null);
  const titleProps = {
    className: styles.rowTitle,
    'data-opportunity-id': opportunity.id,
    onClick: (event: { preventDefault(): void; metaKey?: boolean; ctrlKey?: boolean }) => {
      // Modified clicks on real links open a new tab as usual.
      if (getOpportunityHref && (event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onSelectOpportunity(opportunity.id);
    },
  };
  return (
    <li
      className={styles.row}
      style={{ ['--row-index' as string]: Math.min(index, 8) }}
      onMouseEnter={focus}
      onMouseLeave={blur}
      onFocus={focus}
      onBlur={blur}
    >
      <div className={styles.rowMain}>
        {getOpportunityHref ? (
          <a href={getOpportunityHref(opportunity.id)} {...titleProps}>
            {opportunity.title}
          </a>
        ) : (
          <button type="button" {...titleProps}>
            {opportunity.title}
          </button>
        )}
        <p className={styles.rowMeta}>
          <Phrases parts={[opportunity.agencyName ?? 'Agency not listed', deadlineLabel(opportunity.deadline)]} />
        </p>
        <p className={styles.rowMeta}>
          <Phrases parts={location} />
        </p>
      </div>
      {trailing}
    </li>
  );
}

function FitTag({ fit }: { fit: FitDisplay }) {
  if (fit.kind === 'assessed') {
    return (
      <span className={cx(styles.fit, styles[`fit_${fit.tier}`])}>
        <span className={styles.fitDot} aria-hidden="true" />
        {fit.label}
      </span>
    );
  }
  const text = fit.kind === 'pending' ? 'Assessment pending' : fit.kind === 'unavailable' ? 'Assessment unavailable' : 'Not assessed';
  return <span className={cx(styles.fit, styles.fitUnassessed)}>{text}</span>;
}

function UnplacedWork(props: ServiceAreaExplorerProps & { comparison: ServiceAreaComparison }) {
  const { comparison } = props;
  const { unknown, remote } = comparison;
  if (unknown.length + remote.length === 0) return null;
  const parts = [
    unknown.length > 0 && `${unknown.length} with unknown work location`,
    remote.length > 0 && `${remote.length} remote`,
  ].filter(Boolean);
  return (
    <details className={styles.unplaced}>
      <summary className={styles.unplacedSummary}>
        <span>{parts.join(' · ')}</span>
        <svg className={styles.disclosureIcon} viewBox="0 0 12 12" aria-hidden="true">
          <path d="m4.5 2.75 3.25 3.25-3.25 3.25" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <p className={styles.listNote}>
        Not tied to a county, so adding or removing counties doesn’t change them. Check each listing for where the work happens.
      </p>
      <ul className={styles.list}>
        {unknown.map(({ opportunity, reason }, index) => (
          <OpportunityRow key={opportunity.id} opportunity={opportunity} location={[unknownReasonLabel(reason)]} index={index} actions={props} />
        ))}
        {remote.map((opportunity, index) => (
          <OpportunityRow key={opportunity.id} opportunity={opportunity} location={['Remote']} index={unknown.length + index} actions={props} />
        ))}
      </ul>
    </details>
  );
}

function Footer(props: ServiceAreaExplorerProps) {
  const { isExploring, draft, applyState, onApply, onCancel, onRetryRecalc } = props;
  const saving = applyState.phase === 'saving';
  const empty = isEmptySelection(draft);

  if (!isExploring) {
    if (applyState.phase === 'recalculating') {
      return <p className={cx(styles.footerStatus, styles.muted)}>Service area saved. Updating fit for your new area…</p>;
    }
    if (applyState.phase === 'applied') {
      return (
        <p className={cx(styles.footerStatus, styles.footerSuccess)}>
          Service area updated{applyState.fitUpdated ? '. Fit labels reflect the new area.' : '.'}
        </p>
      );
    }
    if (applyState.phase === 'recalc_failed') {
      return (
        <div className={cx(styles.notice, styles.noticeWarning)} role="alert">
          <p>Your service area was saved, but fit couldn’t be updated. Fit labels stay unavailable until it succeeds.</p>
          <button type="button" className={styles.buttonSecondary} onClick={onRetryRecalc}>
            Retry
          </button>
        </div>
      );
    }
    return <p className={cx(styles.footerStatus, styles.muted)}>Add or remove counties to preview what changes.</p>;
  }

  return (
    <div className={styles.footer}>
      {applyState.phase === 'save_failed' && <SaveError code={applyState.error.code} message={applyState.error.message} />}
      <p className={styles.footerHint}>{empty ? 'Choose at least one county or all of Washington to apply.' : 'This is a preview. Your profile changes only when you apply.'}</p>
      <div className={styles.footerActions}>
        <button type="button" className={styles.buttonSecondary} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="button" className={styles.buttonPrimary} onClick={onApply} disabled={saving || empty}>
          {saving && <span className={styles.spinner} aria-hidden="true" />}
          {saving ? 'Saving…' : 'Apply to profile'}
        </button>
      </div>
    </div>
  );
}

function SaveError({ code, message }: { code: string; message: string }) {
  const text =
    code === 'revision_conflict'
      ? 'Your profile changed somewhere else. Cancel to load the latest service area, then try again.'
      : code === 'unauthenticated'
        ? 'Your session ended. Sign in again to save changes.'
        : message;
  return (
    <p className={cx(styles.notice, styles.noticeError)} role="alert">
      {text}
    </p>
  );
}

function LiveRegion({ profile, comparison, isExploring, applyState }: ServiceAreaExplorerProps) {
  let text = '';
  if (applyState.phase === 'saving') text = 'Saving service area.';
  else if (applyState.phase === 'save_failed') text = 'Service area was not saved.';
  else if (profile && comparison && comparison.catalogSize > 0) {
    text = isExploring
      ? `Preview: ${comparison.after.included} opportunities, ${comparison.added.length} newly included, ${comparison.removed.length} no longer included.`
      : `${comparison.after.included} opportunities in your service area.`;
  }
  return (
    <p className={styles.srOnly} aria-live="polite">
      {text}
    </p>
  );
}
