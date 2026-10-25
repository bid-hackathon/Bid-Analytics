'use client';

/**
 * Schematic stand-in for the shell's real map, showing how a map consumes
 * ServiceAreaMapHighlight and forwards county clicks. Tile positions are only
 * roughly geographic. This is not the map renderer and is not meant to ship.
 */
import type { CountyStat, ExplorerOpportunity } from '../core/comparison';
import type { WashingtonCountyName } from '../core/counties';
import { resolveScope } from '../core/geography';
import type { CountyHighlightState, ServiceAreaMapHighlight } from '../core/highlight';
import styles from './Demo.module.css';

const TILES: ReadonlyArray<[WashingtonCountyName, number, number]> = [
  ['San Juan', 1, 0], ['Whatcom', 2, 0], ['Okanogan', 3, 0], ['Ferry', 4, 0], ['Stevens', 5, 0], ['Pend Oreille', 6, 0],
  ['Clallam', 0, 1], ['Island', 1, 1], ['Skagit', 2, 1], ['Chelan', 3, 1], ['Douglas', 4, 1], ['Lincoln', 5, 1], ['Spokane', 6, 1],
  ['Jefferson', 0, 2], ['Kitsap', 1, 2], ['Snohomish', 2, 2], ['Kittitas', 3, 2], ['Grant', 4, 2], ['Adams', 5, 2], ['Whitman', 6, 2],
  ['Grays Harbor', 0, 3], ['Mason', 1, 3], ['King', 2, 3], ['Yakima', 3, 3], ['Benton', 4, 3], ['Franklin', 5, 3], ['Garfield', 6, 3], ['Asotin', 7, 3],
  ['Pacific', 0, 4], ['Thurston', 1, 4], ['Pierce', 2, 4], ['Klickitat', 3, 4], ['Walla Walla', 5, 4], ['Columbia', 6, 4],
  ['Wahkiakum', 0, 5], ['Lewis', 1, 5], ['Skamania', 2, 5],
  ['Cowlitz', 1, 6], ['Clark', 2, 6],
];

const STATE_CLASS: Record<CountyHighlightState, string> = {
  current: styles.tileCurrent,
  kept: styles.tileCurrent,
  added: styles.tileAdded,
  removed: styles.tileRemoved,
};

export function CountyTileMap(props: {
  highlight: ServiceAreaMapHighlight;
  stats: Readonly<Record<WashingtonCountyName, CountyStat>> | null;
  opportunities: readonly ExplorerOpportunity[];
  onToggleCounty: (county: string) => void;
}) {
  const { highlight, stats, opportunities, onToggleCounty } = props;
  const states = new Map(highlight.counties.map((c) => [c.name, c.state]));
  const focused = opportunities.find((o) => o.id === highlight.focusedOpportunityId);
  const focusedScope = focused ? resolveScope(focused) : null;
  const focusedCounties = new Set(focusedScope?.kind === 'counties' ? focusedScope.counties : []);

  return (
    <div className={styles.mapStage}>
      <div className={styles.tileGrid} role="group" aria-label="Washington counties (schematic)">
        {TILES.map(([name, col, row]) => {
          const state = states.get(name);
          const total = stats?.[name]?.total ?? 0;
          return (
            <button
              key={name}
              type="button"
              className={[styles.tile, state && STATE_CLASS[state], focusedCounties.has(name) && styles.tileFocused].filter(Boolean).join(' ')}
              style={{ gridColumn: col + 1, gridRow: row + 1 }}
              aria-pressed={state === 'current' || state === 'kept' || state === 'added'}
              title={`${name} County${total ? ` · ${total} opportunities` : ''}`}
              onClick={() => onToggleCounty(name)}
            >
              <span className={styles.tileName}>{name}</span>
              {total > 0 && <span className={styles.tileCount}>{total}</span>}
            </button>
          );
        })}
      </div>
      {focusedScope && focusedScope.kind !== 'counties' && (
        <p className={styles.mapCallout}>
          {focusedScope.kind === 'statewide' ? 'Statewide: applies anywhere in Washington' : 'No mappable county for this opportunity'}
        </p>
      )}
      <ul className={styles.legend}>
        <li><span className={`${styles.swatch} ${styles.tileCurrent}`} />Confirmed</li>
        <li><span className={`${styles.swatch} ${styles.tileAdded}`} />Added in preview</li>
        <li><span className={`${styles.swatch} ${styles.tileRemoved}`} />Removed in preview</li>
        <li className={styles.legendNote}>Numbers count opportunities with a site in that county</li>
      </ul>
    </div>
  );
}
