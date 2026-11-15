import { useEffect, useState } from "react";
import type { ThemePreference } from "../services/settings";
export function useAppliedTheme(preference: ThemePreference): "light" | "dark" {
  const [resolved, setResolved] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const root = document.documentElement;
    if (preference !== "system") { root.dataset.theme = preference; setResolved(preference); return; }
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => { const value = media.matches ? "light" : "dark"; root.dataset.theme = value; setResolved(value); };
    apply();
    media.addEventListener("change", apply);
    return () => { delete root.dataset.theme; media.removeEventListener("change", apply); };
  }, [preference]);
  return resolved;
}
