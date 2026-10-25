'use client';

/**
 * DEVELOPMENT HARNESS: synthetic fixtures and simulated services.
 *
 * Shows the integration pattern the shell follows: one hook call in the
 * component that owns the map, `highlight` to the map, `viewProps` to the
 * panel. Mount it on a dev-only route; never in the production journey.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FitAssessment } from '../core/contract';
import { profileAreaLabel } from '../core/serviceArea';
import type { ExplorerProfile } from '../core/serviceArea';
import { DEV_FIXTURE_ASSESSMENTS, DEV_FIXTURE_CATALOG, DEV_FIXTURE_PROFILE } from '../fixtures/syntheticOpportunities.dev';
import { ServiceAreaExplorer } from '../ui/ServiceAreaExplorer';
import type { CatalogState } from '../ui/types';
import { useServiceAreaExplorer } from '../ui/useServiceAreaExplorer';
import { CountyTileMap } from './CountyTileMap';
import { createDemoServices } from './demoServices';
import type { DemoServerProfile, DemoSwitches } from './demoServices';
import styles from './Demo.module.css';

type CatalogMode = 'ready' | 'loading' | 'error' | 'empty';
type ProfileMode = 'counties' | 'radius' | 'unset' | 'none';

export function ServiceAreaExplorerDemo() {
  const server = useRef<DemoServerProfile>({ revision: 3, serviceArea: { kind: 'counties', counties: ['King', 'Pierce', 'Snohomish'] } });
  const [profile, setProfile] = useState<ExplorerProfile>(DEV_FIXTURE_PROFILE);
  const [assessments, setAssessments] = useState<readonly FitAssessment[]>(DEV_FIXTURE_ASSESSMENTS);
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('ready');
  const [profileMode, setProfileMode] = useState<ProfileMode>('counties');
  const [switches, setSwitches] = useState<DemoSwitches>({ failSave: false, failMatching: false, slowMatching: false });
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>(['Loaded synthetic catalog and revision 3 profile.']);
  const push = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));

  const switchesRef = useRef(switches);
  useEffect(() => {
    switchesRef.current = switches;
  });
  const services = useMemo(
    () => createDemoServices({ server: server.current, catalog: () => DEV_FIXTURE_CATALOG, switches: () => switchesRef.current }),
    [],
  );

  const catalog: CatalogState = useMemo(() => {
    if (catalogMode === 'loading') return { status: 'loading' };
    if (catalogMode === 'error') return { status: 'error', message: 'Simulated: the opportunities request failed.' };
    return { status: 'ready', opportunities: catalogMode === 'empty' ? [] : DEV_FIXTURE_CATALOG };
  }, [catalogMode]);

  const shownProfile = useMemo<ExplorerProfile | null>(() => {
    if (profileMode === 'none') return null;
    if (profileMode === 'radius') return { ...profile, serviceArea: { kind: 'unsupported', description: '40 mi around Tacoma' } };
    if (profileMode === 'unset') return { ...profile, serviceArea: { kind: 'unset' } };
    return profile;
  }, [profile, profileMode]);

  const explorer = useServiceAreaExplorer({
    profile: shownProfile,
    catalog,
    assessments,
    services,
    onProfileSaved: (saved) => {
      setProfile((p) => ({ ...p, revision: saved.revision, serviceArea: saved.serviceArea }));
      setProfileMode('counties');
      push(`Saved revision ${saved.revision}: ${profileAreaLabel(saved.serviceArea)}.`);
    },
    onAssessmentsLoaded: (batch) => {
      setAssessments(batch.assessments);
      push(`Fit recalculated for revision ${batch.profileRevision} (${batch.assessments.length} assessments).`);
    },
    onStaleResponse: ({ revision }) => push(`Ignored a late response for revision ${revision}; a newer revision is active.`),
  });

  function simulateExternalEdit() {
    server.current.revision += 1;
    setProfile((p) => ({ ...p, revision: server.current.revision }));
    push(`Profile edited elsewhere: now revision ${server.current.revision}. Older fit results no longer apply.`);
  }

  return (
    <div className={styles.page}>
      <header className={styles.banner}>
        <strong>Service Area Explorer · development harness</strong>
        <span>Synthetic fixtures, not real opportunities. The map is a schematic stand-in for the shell’s map.</span>
      </header>

      <div className={styles.workspace}>
        <main className={styles.stage}>
          <CountyTileMap
            highlight={explorer.highlight}
            stats={explorer.viewProps.comparison?.countyStats ?? null}
            opportunities={DEV_FIXTURE_CATALOG}
            onToggleCounty={explorer.toggleCounty}
          />
          {selected && (
            <p className={styles.toast} role="status">
              onSelectOpportunity(“{selected}”): the shell opens its detail panel here.
            </p>
          )}
        </main>
        <aside className={styles.panel}>
          <ServiceAreaExplorer
            {...explorer.viewProps}
            onSelectOpportunity={setSelected}
            onRetryCatalog={() => setCatalogMode('ready')}
            onStartProfile={() => setProfileMode('counties')}
          />
        </aside>
      </div>

      <section className={styles.devtools} aria-label="Demo controls">
        <Choice label="Catalog" value={catalogMode} options={['ready', 'loading', 'error', 'empty']} onChange={setCatalogMode} />
        <Choice label="Profile area" value={profileMode} options={['counties', 'radius', 'unset', 'none']} onChange={setProfileMode} />
        <fieldset className={styles.fieldset}>
          <legend>Simulate</legend>
          {(['failSave', 'failMatching', 'slowMatching'] as const).map((key) => (
            <label key={key} className={styles.check}>
              <input type="checkbox" checked={switches[key]} onChange={(e) => setSwitches((s) => ({ ...s, [key]: e.target.checked }))} />
              {{ failSave: 'Save fails', failMatching: 'Matching fails', slowMatching: 'Slow matching (3.5 s)' }[key]}
            </label>
          ))}
          <button type="button" className={styles.devButton} onClick={simulateExternalEdit}>
            Edit profile elsewhere
          </button>
        </fieldset>
        <div className={styles.logBox}>
          <p className={styles.logTitle}>
            Active revision <strong>{profile.revision}</strong> · Map mode <strong>{explorer.highlight.mode}</strong>
          </p>
          <ol className={styles.log}>
            {log.map((line, i) => (
              <li key={`${log.length - i}`}>{line}</li>
            ))}
          </ol>
        </div>
      </section>
    </div>
  );
}

function Choice<T extends string>(props: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>{props.label}</legend>
      {props.options.map((option) => (
        <label key={option} className={styles.check}>
          <input type="radio" name={props.label} checked={props.value === option} onChange={() => props.onChange(option)} />
          {option}
        </label>
      ))}
    </fieldset>
  );
}
