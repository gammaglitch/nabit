"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Selection state for the library's multi-select mode.
 *
 * Selection is kept pruned to `visibleIds`. Changing a filter or the search
 * box while items are selected would otherwise leave rows selected that are no
 * longer on screen, and the next DELETE would take items the user could not
 * see — the count in the action bar always means "these highlighted rows".
 *
 * The shift-click anchor is the last row toggled on. Shift-clicking extends
 * from there through the row clicked, following the order items are rendered
 * in rather than their ids, so a range matches what the eye picked out under
 * whatever sort is active.
 */
export function useBulkSelection(visibleIds: number[]) {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const anchorRef = useRef<number | null>(null);

  // Returns `prev` untouched when nothing was pruned, so a re-run on an
  // unchanged list costs a set build and no render.
  useEffect(() => {
    if (!active) return;
    const visible = new Set(visibleIds);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [active, visibleIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const exit = useCallback(() => {
    setActive(false);
    clear();
  }, [clear]);

  const toggleMode = useCallback(() => {
    setActive((prev) => {
      if (prev) clear();
      return !prev;
    });
  }, [clear]);

  const toggle = useCallback(
    (id: number, extend = false) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = anchorRef.current;

        if (extend && anchor !== null && anchor !== id) {
          const from = visibleIds.indexOf(anchor);
          const to = visibleIds.indexOf(id);
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from];
            for (const rangeId of visibleIds.slice(lo, hi + 1)) {
              next.add(rangeId);
            }
            return next;
          }
        }

        if (next.has(id)) {
          next.delete(id);
          if (anchor === id) anchorRef.current = null;
        } else {
          next.add(id);
          anchorRef.current = id;
        }
        return next;
      });
    },
    [visibleIds],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(visibleIds));
    anchorRef.current = null;
  }, [visibleIds]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  return {
    active,
    clear,
    exit,
    isSelected: useCallback((id: number) => selected.has(id), [selected]),
    selectAll,
    selectedIds,
    toggle,
    toggleMode,
  };
}
