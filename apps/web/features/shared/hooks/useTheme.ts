"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "paper" | "terminal";

const STORAGE_KEY = "nabit.theme";

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "paper";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "terminal" ? "terminal" : "paper";
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("paper");

  useEffect(() => {
    setThemeState(readStoredTheme());
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  return [theme, setTheme];
}
