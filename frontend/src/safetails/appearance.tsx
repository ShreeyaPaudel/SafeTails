// @ts-nocheck
/* ============================================================
   SafeTails - Appearance & accessibility preferences
   ------------------------------------------------------------
   Theme (light / dark / system), reduced motion and larger text.
   Applied to <html> as data-attributes / classes that styles.css
   keys off, and persisted in localStorage so choices survive
   across sessions and apply immediately (no flash on navigation).
   ============================================================ */
import { createContext, useContext, useEffect, useState, useCallback } from "react";

const K_THEME = "st_theme";        // "light" | "dark" | "system"
const K_MOTION = "st_reduce_motion";
const K_TEXT = "st_large_text";

function apply(theme: string, reduceMotion: boolean, largeText: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme || "system");
  root.classList.toggle("reduce-motion", !!reduceMotion);
  root.classList.toggle("large-text", !!largeText);
}

const AppearanceCtx = createContext<any>({
  theme: "system", setTheme: () => {},
  reduceMotion: false, setReduceMotion: () => {},
  largeText: false, setLargeText: () => {},
});

export function AppearanceProvider({ children }: any) {
  const [theme, setThemeState] = useState("system");
  const [reduceMotion, setRMState] = useState(false);
  const [largeText, setLTState] = useState(false);

  // Restore on first mount + apply.
  useEffect(() => {
    let t = "system", rm = false, lt = false;
    try {
      t = window.localStorage.getItem(K_THEME) || "system";
      rm = window.localStorage.getItem(K_MOTION) === "1";
      lt = window.localStorage.getItem(K_TEXT) === "1";
    } catch {}
    setThemeState(t); setRMState(rm); setLTState(lt);
    apply(t, rm, lt);
  }, []);

  const setTheme = useCallback((t: string) => { setThemeState(t); try { window.localStorage.setItem(K_THEME, t); } catch {} apply(t, reduceMotion, largeText); }, [reduceMotion, largeText]);
  const setReduceMotion = useCallback((v: boolean) => { setRMState(v); try { window.localStorage.setItem(K_MOTION, v ? "1" : "0"); } catch {} apply(theme, v, largeText); }, [theme, largeText]);
  const setLargeText = useCallback((v: boolean) => { setLTState(v); try { window.localStorage.setItem(K_TEXT, v ? "1" : "0"); } catch {} apply(theme, reduceMotion, v); }, [theme, reduceMotion]);

  return (
    <AppearanceCtx.Provider value={{ theme, setTheme, reduceMotion, setReduceMotion, largeText, setLargeText }}>
      {children}
    </AppearanceCtx.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceCtx);
}
