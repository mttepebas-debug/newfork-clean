import type { ThemePreference } from "@newfork/shared";

// Keep this key in sync with the pre-paint bootstrap in index.html.
const themeStorageKey = "newfork.theme";
let preference: ThemePreference = "system";
try {
  const saved = window.localStorage.getItem(themeStorageKey);
  if (saved === "light" || saved === "dark") preference = saved;
} catch { /* Appearance still works when browser storage is unavailable. */ }

const systemTheme = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function renderTheme(): void {
  const resolved = preference === "system"
    ? (systemTheme?.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

const followSystem = () => { if (preference === "system") renderTheme(); };
systemTheme?.addEventListener?.("change", followSystem);
import.meta.hot?.dispose(() => systemTheme?.removeEventListener?.("change", followSystem));

/** Preview by default. Persist only the saved account preference. */
export function applyThemePreference(theme: ThemePreference, persist = false): void {
  preference = theme;
  renderTheme();
  if (persist) {
    try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* Optional cache. */ }
  }
}
