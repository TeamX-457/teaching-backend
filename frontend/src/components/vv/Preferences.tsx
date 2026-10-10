import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Applies accessibility & appearance preferences to the document. */
export function Preferences() {
  const s = useStore((st) => st.settings);
  useEffect(() => {
    const h = document.documentElement;
    h.classList.toggle("reduce-motion", s.reducedMotion);
    h.classList.toggle("contrast-mode", s.highContrast);
    h.classList.toggle("text-lg-mode", s.textSize === "large");
    h.classList.toggle("text-xl-mode", s.textSize === "xl");
    const dark = s.theme === "dark" || (s.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    h.classList.toggle("dark", dark);
  }, [s.reducedMotion, s.highContrast, s.textSize, s.theme]);
  return null;
}
