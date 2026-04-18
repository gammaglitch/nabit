"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nabit.starred";

function readStored(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is number => typeof x === "number"));
  } catch {
    return new Set();
  }
}

function writeStored(ids: Set<number>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
}

export function useStarred() {
  const [starred, setStarred] = useState<Set<number>>(new Set());

  useEffect(() => {
    setStarred(readStored());
  }, []);

  const isStarred = useCallback(
    (id: number) => starred.has(id),
    [starred],
  );

  const toggleStarred = useCallback((id: number) => {
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeStored(next);
      return next;
    });
  }, []);

  return { starred, isStarred, toggleStarred };
}
