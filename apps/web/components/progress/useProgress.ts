"use client";

import { useEffect, useState } from "react";
import { PROGRESS_KEY, readProgress, type Progress } from "../../lib/progress";

/**
 * This browser's progress. null until the page has mounted: the server can't see localStorage, so
 * the first render shows no status rather than a wrong one. Follows changes made in other tabs.
 */
export function useProgress(): Progress | null {
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => {
    setProgress(readProgress());
    const onStorage = (e: StorageEvent) => {
      if (e.key === PROGRESS_KEY || e.key === null) setProgress(readProgress());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return progress;
}
