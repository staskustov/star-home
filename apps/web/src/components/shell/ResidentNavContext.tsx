"use client";

import { createContext, useContext, useEffect, useState } from "react";

const storageKey = "star-home-resident-nav";

type ResidentNavContextValue = {
  expanded: boolean;
  toggle: () => void;
  ready: boolean;
};

const ResidentNavContext = createContext<ResidentNavContextValue>({
  expanded: false,
  toggle: () => undefined,
  ready: false,
});

export function useResidentNav() {
  return useContext(ResidentNavContext);
}

export function ResidentNavProvider({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setExpanded(localStorage.getItem(storageKey) === "expanded");
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  function toggle() {
    setExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey, next ? "expanded" : "collapsed");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return <ResidentNavContext.Provider value={{ expanded, toggle, ready }}>{children}</ResidentNavContext.Provider>;
}
