# Service Area Explorer

Lets a signed-in vendor preview how adding or removing Washington counties changes the open opportunities within reach, then **apply** the change to their profile or **cancel** it. Exploring is temporary; only Apply writes a new profile revision. After Apply, personalized fit is recalculated for the new revision, and responses for older revisions are dropped.

SRS coverage: J-02 step 7, AT-08, MAP-07, MAP-09, §8.3, §11.3, §12.8, §13.6, REC-07, REC-09, ONB-09.

Built before the app shell existed. The feature is a self-contained folder with relative imports only. Move it into the shell's source tree (for example `git mv features/service-area-explorer src/features/`) and nothing else changes. It makes no changes to the root package, lockfile, global CSS, routes, auth, ingestion, embeddings or ranking.

## How it fits together

```
           ┌─────────── parent (owns the map) ───────────┐
profile ──▶│ useServiceAreaExplorer({ profile, catalog,  │──▶ highlight ──▶ <Map/> draws counties & markers
catalog ──▶│   assessments, services, onProfileSaved,    │◀── toggleCounty ◀── county click on map
fit     ──▶│   onAssessmentsLoaded })                    │──▶ viewProps ──▶ <ServiceAreaExplorer/>
           └──────────────────────────────────────────────┘
services: saveServiceArea → PUT /api/v1/me/profile, fetchAssessments → POST /api/v1/matches
```

- **`core/`** is pure TypeScript with no React: county list, location resolution, before/after comparison, draft reducer, revision guard, apply controller.
- **`ui/useServiceAreaExplorer`** holds local draft and apply state in the component that owns the map. It adds no global store.
- **`ui/ServiceAreaExplorer`** is presentational and fully controlled. You can drive it from the shell's own state instead of the hook.
- **`adapters/`** has a default HTTP client for the SRS §13 routes, plus a mapper for Workstream C's current `bids` rows.

## Integration

```tsx
import {
  ServiceAreaExplorer,
  useServiceAreaExplorer,
  createHttpServiceAreaServices,
  parseProfileServiceArea,
} from '@/features/service-area-explorer';

const services = createHttpServiceAreaServices({
  buildMatchBody: ({ profileRevision }) => ({ profileRevision, filters: currentFiltersWithoutGeography }),
});

function DiscoverView() {
  const explorer = useServiceAreaExplorer({
    profile: activeProfile && {
      profileId: activeProfile.id,
      revision: activeProfile.revision,
      serviceArea: parseProfileServiceArea(activeProfile.serviceArea),
      vendorProfile: activeProfile, // only needed if PUT /me/profile replaces the whole record
    },
    catalog,              // { status: 'loading' | 'error' | 'ready', opportunities }
    assessments,          // the shell's current FitAssessment[]; non-current revisions are ignored
    services,
    onProfileSaved: (saved) => setActiveProfile(/* new revision + saved.serviceArea */),
    onAssessmentsLoaded: (batch) => setAssessments(batch.assessments), // only ever the active revision
  });

  return (
    <>
      <Map serviceArea={explorer.highlight} onCountyClick={explorer.toggleCounty} />
      <ServiceAreaExplorer {...explorer.viewProps} onSelectOpportunity={openDetailPanel} />
    </>
  );
}
```

### What the parent provides

| Input | Contract |
| --- | --- |
| `profile` | Active **confirmed** profile: `profileId`, opaque `revision`, `serviceArea`. Pass `null` before onboarding; the panel shows a set-up state (`onStartProfile`). |
| `catalog` | Opportunities matching the user's other filters, **with no county or service-area filter applied**, so out-of-area work can appear as "newly included". Same catalog version as the map so counts reconcile (MAP-09). `error` is a failed load, never an empty result. |
| `ExplorerOpportunity` | SRS §12.4 `id`, `version`, `title`, `deadline`, `locations[]`, `locationStatus`, plus `agencyName` resolved from `agencyId`. Canonical records satisfy `core/contract.ts` structurally. |
| `assessments` | SRS §12.9 `FitAssessment[]`. Only records whose `profileRevision` equals the active revision (and whose `opportunityVersion` matches, when both are known) are shown. |
| `services` | `saveServiceArea` (required) and `fetchAssessments` (optional). Omit `fetchAssessments` if the shell already refetches matches on every revision change. The explorer then reports "updated" without claiming fit was recomputed. |
| `onProfileSaved` | Make the saved revision the active profile. Until the shell passes it back, the explorer keeps the saved area as its baseline, so nothing flickers. |
| `onSelectOpportunity(id)` | Open the shell's detail panel for that canonical ID. Pass `getOpportunityHref` to render real links instead. |
| `includeStatewide` | Mirrors the shared filter's `includeStatewide` (default `true`). |

### What the map consumes (`explorer.highlight`)

```ts
{
  mode: 'confirmed' | 'exploring',
  counties: [{ name: 'Pierce', fips: '53053', state: 'current' | 'kept' | 'added' | 'removed' }],
  statewide: { confirmed: boolean, draft: boolean },
  addedOpportunityIds: string[],    // markers to emphasize as newly reachable
  removedOpportunityIds: string[],  // markers to de-emphasize
  focusedOpportunityId: string | null, // hovered/focused row in the panel
}
```

Key county feature state on `fips` (`53001`–`53077`). Suggested styling: confirmed/kept use the accent fill, added uses the green outline, removed uses an orange dashed outline. Keep the same green and orange the panel uses. `demo/CountyTileMap.tsx` shows the wiring against a schematic grid; it is not a map renderer.

### Design tokens

All styling is in `ui/ServiceAreaExplorer.module.css`, a CSS module. Each local token falls back to a shell token if one is defined, otherwise to a dark Apple Maps-style default. To adopt the shell's design system, define these or rename them in the one token block on `.root`:

`--font-sans`, `--surface-panel`, `--surface-fill`, `--surface-fill-strong`, `--separator`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--diff-added`, `--diff-removed`, `--danger`, `--fit-good`, `--fit-possible`, `--fit-needs-review`, `--fit-not`, `--radius-lg`, `--radius-sm`.

The panel sets its own padding, radius and translucent background; the parent decides width and position (≈360–400 px works best). Motion is CSS-only and is disabled under `prefers-reduced-motion`.

## Semantics

- **Geography is not fit.** "Newly included" means within the draft area geographically. Those rows deliberately show **no fit label**. The active revision's assessments were computed against the old area and often say *Not a fit* for exactly these items. Fit appears after Apply, from the recalculated revision. "No longer included" rows do show current-revision fit, so the vendor sees what they would lose ("Includes 1 Good fit…").
- **Counted once.** Opportunities are deduplicated by canonical ID. Multi-site work is included when *any* resolved county is selected (SRS §8.3), so removing one of its counties only drops it if no other selected county reaches it.
- **Statewide** work counts as inside any non-empty Washington area and is called out separately ("Includes 1 statewide opportunity…"). It joins with the first county and leaves with the last.
- **Unknown stays unknown.** Missing locations, `precision: 'unknown'`, a city with no county (cities can span counties), and non-Washington county names are never placed. They and **remote** work sit in a separate bucket that county changes cannot affect. `displayPoint` is never used to infer a county, because it may be an approximation or an agency address (SRS §4.4).
- **Agency-derived counties** (`resolutionMethod: 'agency_jurisdiction'`) count for inclusion but are disclosed in the summary and on each row.
- **Radius or drawn areas** can't be diffed by county. The "before" count shows "—" and Apply replaces the area with counties.
- **Revision safety.** Apply sends `baseRevision`; a `revision_conflict` keeps the draft and explains. A matching response is accepted only if it is for the latest known revision, both by request and by its own `profileRevision`. A newer save, or a profile change from elsewhere, aborts and drops the older recalculation. Numeric revisions never move backwards; opaque ones compare by equality.

## Integration dependencies

The feature runs today against fixtures. These items are needed from other owners to run it on real data:

| Owner | Needed | Why |
| --- | --- | --- |
| A (shell) | Mount point next to the map; pass `highlight` to the county layer keyed by FIPS; route `toggleCounty` from county clicks; `onSelectOpportunity` → detail panel. | The explorer never renders geography. |
| A (shell) | A catalog fetch **without** county/service-area filters (same other filters), and `agencyName` resolved per opportunity. | Out-of-area work must be visible to be "newly included". |
| B (matching) | Final `VendorProfile.serviceArea` shape. Proposed: `toProfileServiceAreaPayload()` → `{ kind: 'counties', countyNames, countyFips, provenance: 'user_entered' }` or `{ kind: 'statewide', … }`. `parseProfileServiceArea()` reads it plus common variants. | Save and read back the confirmed area. |
| B (matching) | Fit tier spelling (`good_fit` vs `Good fit`; both accepted) and `profileRevision` on every match response (REC-07). | Responses without a revision are rejected as unverifiable. |
| C (API) | `PUT /api/v1/me/profile` revision control: accepts `baseRevision`, returns the new `revision`, answers `409 revision_conflict` when stale. Clarify full-record vs patch (`buildProfileBody` adapts). | Optimistic concurrency for Apply. |
| C (API) | Each confirmed revision regenerates `textSummary` + `embedding` server-side (ONB-13). | The explorer only saves the area. |
| C (data) | Canonical `locations[]` with `countyNames`. Until then, `opportunitiesFromBidRows()` maps the current `bids` table. Its `county` is copied from the agency record by `scripts/pull_bids.py`, so it is disclosed as agency-derived, and `lat`/`lng` are ignored. Switch to `{ countyBasis: 'work_location' }` once the collector extracts place of performance. | Truthful location semantics. |

## Verification

```sh
# 51 logic tests, no installs needed (Node ≥ 22.18 strips TS types natively)
node --import ./features/service-area-explorer/test/resolve-ts.mjs --test 'features/service-area-explorer/test/*.test.ts'
```

Covered: county selection and statewide toggling; cancellation restoring the exact confirmed area; unique counts with repeated IDs; the catalog partition invariant; multi-site add and remove; unknown, remote, city-without-county and non-WA locations; statewide inclusion and `includeStatewide`; radius baselines; deadline ordering; per-county gain and loss; current-revision-only fit; stale opportunity versions; unrecognized tiers; out-of-order and superseded matching responses; mislabelled response revisions; lagging revision reports; save and recalc failures; abort on dispose; HTTP envelope and error mapping; the `bids` row adapter; map highlight states.

Also run during development, outside the repo, so no tooling was added:

- `tsc --strict` with `verbatimModuleSyntax`, `noUnusedLocals` and `noUnusedParameters` over every `.ts`/`.tsx` file in this folder.
- A headless-Chrome walkthrough of the demo harness covering 16 scenarios: add via combobox, remove via map tile, hover → map focus, select → canonical ID, cancel, apply → recalc, stale response after an external profile edit, save failure, recalc failure + retry, catalog loading/error/empty, radius/unset/no profile, statewide, keyboard-only flow, and a 390 px viewport with no horizontal overflow. No React warnings under StrictMode.

## Demo

`demo/ServiceAreaExplorerDemo.tsx` is a development harness using **synthetic fixtures** (`fixtures/syntheticOpportunities.dev.ts`, every title prefixed `[Synthetic]`, plus Workstream C's two `MOCK:` rows). It uses simulated services with switches for failures, slow matching and an external profile edit, and an event log that shows stale responses being dropped.

- Inside the app: render `<ServiceAreaExplorerDemo />` on a dev-only route. It must never be reachable in the production journey.
- Standalone, once React is installed: `npx esbuild@0.25 features/service-area-explorer/demo/main.tsx --bundle --outdir=/tmp/sae-demo --loader:.module.css=local-css --jsx=automatic --define:process.env.NODE_ENV='"development"' && cp features/service-area-explorer/demo/index.html /tmp/sae-demo/`, then serve `/tmp/sae-demo`.

## Status (SRS §23.4)

```text
Workstream: A (Frontend), Service Area Explorer sub-feature
Branch / commit: feat/service-area-explorer
Implemented requirement IDs: J-02.7, AT-08, MAP-07 (panel side), MAP-09 (explorer counts), §8.3 multi-location/statewide/unknown semantics,
  §11.3 unassessed ≠ Not a fit, REC-07 stale-response guard, REC-09 no fake tiers, ONB-09 (service-area edits)
Working interfaces: useServiceAreaExplorer, <ServiceAreaExplorer/>, ServiceAreaMapHighlight, ServiceAreaServices, createHttpServiceAreaServices, opportunitiesFromBidRows
Validation performed: 51 node:test logic tests; strict tsc; 16-scenario headless browser walkthrough of the demo harness
Actual source coverage or evaluation results: no real opportunity records exist in the repository yet; verified on synthetic fixtures only
Known incomplete requirements: not yet mounted in the shell; real map layer styling; real API endpoints untested
Dependencies needed from another owner: see "Integration dependencies"
Contract changes proposed or accepted: proposed VendorProfile.serviceArea payload; proposed resolutionMethod 'agency_jurisdiction'
Next integration action: move folder into the shell, wire highlight to the county layer, point services at C's routes
```
