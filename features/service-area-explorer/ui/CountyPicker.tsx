'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CountyStat } from '../core/comparison';
import { WASHINGTON_COUNTY_NAMES } from '../core/counties';
import type { WashingtonCountyName } from '../core/counties';
import { cx } from './format';
import styles from './ServiceAreaExplorer.module.css';

interface CountyPickerProps {
  selected: ReadonlySet<WashingtonCountyName>;
  /** Null while the catalog is loading or failed; options then show no counts. */
  stats: Readonly<Record<WashingtonCountyName, CountyStat>> | null;
  disabled?: boolean;
  onToggle: (county: WashingtonCountyName) => void;
}

/** Prefix matches first, then matches at a word start, then anywhere. */
function matchCounties(query: string): WashingtonCountyName[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...WASHINGTON_COUNTY_NAMES];
  const rank = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith(q)) return 0;
    if (lower.split(' ').some((word) => word.startsWith(q))) return 1;
    return lower.includes(q) ? 2 : 3;
  };
  return WASHINGTON_COUNTY_NAMES.filter((name) => rank(name) < 3).sort((a, b) => rank(a) - rank(b));
}

export function CountyPicker({ selected, stats, disabled, onToggle }: CountyPickerProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const optionPrefix = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const options = useMemo(() => matchCounties(query), [query]);
  const activeName = open ? options[Math.min(active, options.length - 1)] : undefined;
  const optionId = (name: string) => `${optionPrefix}-${name.replace(/\s+/g, '-')}`;

  useEffect(() => {
    if (!activeName) return;
    listRef.current?.querySelector(`[data-county="${activeName}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeName]);

  function toggle(name: WashingtonCountyName) {
    onToggle(name);
    setQuery('');
    setActive(Math.max(0, WASHINGTON_COUNTY_NAMES.indexOf(name)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return setOpen(true);
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (Math.min(i, options.length - 1) + step + options.length) % options.length);
    } else if (event.key === 'Enter' && activeName) {
      event.preventDefault();
      toggle(activeName);
    } else if (event.key === 'Escape') {
      if (query) setQuery('');
      else setOpen(false);
    }
  }

  return (
    <div className={styles.picker} data-open={open || undefined}>
      <div className={styles.search}>
        <svg className={styles.searchIcon} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3.25 3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          className={styles.searchInput}
          type="text"
          role="combobox"
          aria-label="Add or remove a Washington county"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeName ? optionId(activeName) : undefined}
          placeholder="Add or remove counties"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && (
        <ul ref={listRef} id={listId} className={styles.options} role="listbox" aria-multiselectable="true" aria-label="Washington counties">
          {options.map((name) => {
            const isSelected = selected.has(name);
            const stat = stats?.[name];
            return (
              <li
                key={name}
                id={optionId(name)}
                data-county={name}
                role="option"
                aria-selected={isSelected}
                className={cx(styles.option, name === activeName && styles.optionActive)}
                // Keep focus in the input so the list stays open for several toggles.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggle(name)}
                onMouseMove={() => setActive(options.indexOf(name))}
              >
                <span className={styles.optionCheck} aria-hidden="true">
                  {isSelected && (
                    <svg viewBox="0 0 12 12">
                      <path d="m2.5 6.25 2.25 2.25 4.75-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={styles.optionName}>{name}</span>
                {stat && <OptionMeta selected={isSelected} stat={stat} />}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className={styles.optionEmpty} role="presentation">
              No Washington county matches “{query.trim()}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function OptionMeta({ selected, stat }: { selected: boolean; stat: CountyStat }) {
  if (selected) {
    return stat.lossIfRemoved > 0 ? (
      <span className={cx(styles.optionMeta, styles.optionMetaLoss)}>−{stat.lossIfRemoved} if removed</span>
    ) : null;
  }
  return (
    <span className={cx(styles.optionMeta, stat.gainIfAdded > 0 && styles.optionMetaGain)}>
      {stat.gainIfAdded > 0 ? `+${stat.gainIfAdded} new` : 'No new'}
    </span>
  );
}
