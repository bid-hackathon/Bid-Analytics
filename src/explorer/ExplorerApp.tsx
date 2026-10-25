"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExplorerServices } from "@/lib/services/types";
import { PRECISION_COPY } from "@/lib/taxonomy";
import { MapView, type MapHandle, type MapPoint } from "@/map/MapView";
import { countyBounds } from "@/map/geo";
import { ExplorerProvider, selectResults, useExplorer } from "./store";
import { AuthScreen } from "./components/AuthScreen";
import { ResultsPanel } from "./components/ResultsPanel";
import { DetailPanel } from "./components/DetailPanel";
import { Onboarding } from "./components/Onboarding";
import { AccountButton, CoverageSheet, DataBanner, Legend, MapControls, Toast } from "./components/Chrome";
import { IconAlert, IconArea, IconMap } from "./components/Icons";
import { BrandLockup, BRAND_NAME, PRODUCT_NAME } from "./components/Brand";

/** Brand bar height per layout; matches --bar-h in app.css. */
const BAR_H = { wide: 56, narrow: 52 };

export function ExplorerApp({ services }: { services: ExplorerServices }) {
  return (
    <ExplorerProvider services={services}>
      <Shell />
    </ExplorerProvider>
  );
}

type Layout = "wide" | "medium" | "narrow";
function useLayout(): Layout {
  const get = (): Layout => (typeof window === "undefined" ? "wide" : window.innerWidth >= 1180 ? "wide" : window.innerWidth >= 760 ? "medium" : "narrow");
  const [l, setL] = useState<Layout>(get);
  useEffect(() => {
    const on = () => setL(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return l;
}

function Shell() {
  const { state, actions, dispatch } = useExplorer();
  const layout = useLayout();
  const mapRef = useRef<MapHandle>(null);
  const [legendOpen, setLegendOpen] = useState(layout === "wide");
  const [imageryFailed, setImageryFailed] = useState(false);
  const [sheet, setSheet] = useState<"peek" | "half" | "full">("half");
  const signedIn = !!state.session;
  const results = selectResults(state);
  const detailOpen = !!state.selectedId;

  const points: MapPoint[] = useMemo(
    () =>
      results.all.flatMap((o) =>
        o.locations
          .filter((l) => l.displayPoint)
          .map((l) => ({
            key: `${o.id}:${l.id}`,
            oppId: o.id,
            lngLat: l.displayPoint!,
            approximate: PRECISION_COPY[l.precision].approximate,
            title: o.title,
            tier: results.personalized ? state.matching.byId[o.id]?.tier ?? null : undefined,
          })),
      ),
    [results.all, results.personalized, state.matching.byId],
  );

  const sheetHeight = layout === "narrow" ? (sheet === "peek" ? 132 : sheet === "half" ? Math.round(window.innerHeight * 0.5) : window.innerHeight - BAR_H.narrow - 12) : 0;
  const insets = useMemo(() => {
    if (!signedIn) return { top: 0, right: 0, bottom: 0, left: 0 };
    if (layout === "narrow") return { top: BAR_H.narrow + 64, right: 56, bottom: sheetHeight, left: 0 };
    const left = 12 + 392 + (layout === "wide" && detailOpen ? 12 + 404 : 0);
    return { top: BAR_H.wide + 60, right: 64, bottom: 16, left: left + 12 };
  }, [layout, detailOpen, sheetHeight, signedIn]);

  // Re-frame Washington around the panels once the explorer opens.
  useEffect(() => {
    if (signedIn) setTimeout(() => mapRef.current?.resetToWashington(), 50);
  }, [signedIn]);

  const select = useCallback((id: string | null, fly = false) => {
    dispatch({ type: "select", id });
    if (id && layout === "narrow") setSheet((s) => (s === "peek" ? "half" : s));
    if (id && fly) {
      const o = state.catalog.data.find((x) => x.id === id);
      const pts = o?.locations.flatMap((l) => (l.displayPoint ? [l.displayPoint] : [])) ?? [];
      if (pts.length) setTimeout(() => mapRef.current?.flyToPoints(pts), 30);
    }
  }, [dispatch, layout, state.catalog.data]);

  // List selection flies the map; map selection doesn't need to.
  const onListSelect = useCallback((id: string) => select(id, true), [select]);
  const onMapSelect = useCallback((id: string) => select(id, false), [select]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.selectedId && !state.onboarding && !state.sheet) actions.select(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state.selectedId, state.onboarding, state.sheet, actions]);

  // Selection that falls out of the result set closes its detail view.
  useEffect(() => {
    if (state.selectedId && state.catalog.status === "ready" && !state.catalog.data.some((o) => o.id === state.selectedId)) actions.select(null);
  }, [state.catalog, state.selectedId, actions]);

  const onCountyClick = useCallback((name: string) => {
    const on = state.filter.countyNames.includes(name);
    actions.setFilter({ countyNames: on ? state.filter.countyNames.filter((c) => c !== name) : [...state.filter.countyNames, name] });
    dispatch({ type: "toast", text: on ? `Removed ${name} County filter` : `Filtering to ${name} County` });
    if (!on) {
      const b = countyBounds(name);
      if (b) mapRef.current?.flyToBounds(b, 1.6);
    }
  }, [state.filter.countyNames, actions, dispatch]);

  const onUserMove = useCallback(() => dispatch({ type: "area/dirty", value: true }), [dispatch]);
  const onHover = useCallback((id: string | null) => dispatch({ type: "hover", id }), [dispatch]);
  const onImageryError = useCallback(() => setImageryFailed(true), []);

  const serviceCounties = state.profile?.serviceArea.value?.kind === "counties" ? state.profile.serviceArea.value.counties : [];

  const results$ = <ResultsPanel onSelect={onListSelect} />;
  const detail$ = detailOpen ? <DetailPanel onClose={() => actions.select(null)} showBack={layout !== "wide"} /> : null;

  return (
    <div className={`app layout-${layout}${signedIn ? "" : " is-gated"}${layout === "narrow" ? ` sheet-${sheet}` : ""}`}>
      <div className="map-stage" aria-hidden={!signedIn || undefined}>
        <MapView
          ref={mapRef}
          points={points}
          selectedId={state.selectedId}
          hoveredId={state.hoveredId}
          serviceCounties={serviceCounties}
          filterCounties={state.filter.countyNames}
          personalized={results.personalized}
          insets={insets}
          showMarkers={signedIn && state.catalog.status !== "idle"}
          onSelect={onMapSelect}
          onHover={onHover}
          onCountyClick={onCountyClick}
          onUserMove={onUserMove}
          onImageryError={onImageryError}
        />
      </div>

      <header className="topbar">
        <a className="topbar-brand" href="/" aria-label={`${BRAND_NAME}, ${PRODUCT_NAME}`} onClick={(e) => { e.preventDefault(); if (signedIn) { actions.select(null); mapRef.current?.resetToWashington(); } }}>
          <BrandLockup subtitle={PRODUCT_NAME} />
        </a>
        <span className="topbar-spacer" />
        {signedIn && <AccountButton />}
      </header>

      {!state.authChecked ? null : !signedIn ? (
        <AuthScreen />
      ) : (
        <>
          {layout !== "narrow" ? (
            <>
              <aside className="panel panel-results" aria-label="Opportunities">
                {layout === "medium" && detailOpen ? detail$ : results$}
              </aside>
              {layout === "wide" && detailOpen && <aside className="panel panel-detail" aria-label="Opportunity details">{detail$}</aside>}
            </>
          ) : (
            <aside className={`sheet is-${sheet}`} aria-label={detailOpen ? "Opportunity details" : "Opportunities"} style={{ height: sheetHeight }} onFocusCapture={() => sheet === "peek" && setSheet("half")}>
              <button className="sheet-handle" onClick={() => setSheet((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))} aria-label={sheet === "full" ? "Shrink panel" : "Expand panel"}>
                <span />
              </button>
              {detailOpen ? detail$ : results$}
            </aside>
          )}

          <div className="top-right">
            <MapControls map={mapRef} legendOpen={legendOpen} onLegend={() => setLegendOpen((o) => !o)} />
          </div>
          <div className="top-center" style={layout === "wide" || layout === "medium" ? { left: insets.left, right: insets.right } : undefined}>
            <DataBanner />
            {imageryFailed && (
              <p className="map-error" role="status"><IconAlert size={15} />Map imagery didn't load. County outlines and the results list still work.</p>
            )}
          </div>
          {legendOpen && layout !== "narrow" && <Legend personalized={results.personalized} onClose={() => setLegendOpen(false)} />}
          {legendOpen && layout === "narrow" && sheet === "peek" && <Legend personalized={results.personalized} onClose={() => setLegendOpen(false)} />}

          {state.areaDirty && (
            <div className="area-action" style={{ left: insets.left, right: insets.right, bottom: insets.bottom + 16 }}>
              <button className="btn btn-glass" onClick={() => { const b = mapRef.current?.getBounds(); if (b) actions.setFilter({ viewportBounds: b }); }}>
                <IconArea size={16} />Search this area
              </button>
            </div>
          )}

          {/* Only the full sheet hides the map, so only then does it need a way back. Peek and half use the handle. */}
          {layout === "narrow" && sheet === "full" && (
            <button className="view-toggle btn btn-glass" onClick={() => setSheet("peek")}>
              <IconMap size={16} />Map
            </button>
          )}

          {state.onboarding && <Onboarding key={`${state.onboarding.mode}-${state.profile?.revision ?? 0}`} />}
          {state.sheet === "coverage" && <CoverageSheet />}
          {state.reauthRequired && <AuthScreen reauth />}
          <Toast />
        </>
      )}
    </div>
  );
}
