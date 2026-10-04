// DEV-only typeface comparison (BRAND step 1). Open any screen with ?font=inter|plex|source,
// or use the switcher in the bottom-left corner; ?font=today goes back to the current stack.
// Fonts load from Google Fonts here only; the chosen one gets self-hosted, then this file goes.
const storageKey = "nf-dev-font";
const fallback =
  'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const variants = {
  today: { label: "Today", family: "", css: "" },
  inter: {
    label: "Inter",
    family: `Inter, ${fallback}`,
    css: "Inter:wght@400..800",
  },
  plex: {
    label: "IBM Plex Sans",
    family: `"IBM Plex Sans", ${fallback}`,
    css: "IBM+Plex+Sans:wght@400;500;600;700",
  },
  source: {
    label: "Source Sans 3",
    family: `"Source Sans 3", ${fallback}`,
    css: "Source+Sans+3:wght@400..800",
  },
} as const;

type VariantId = keyof typeof variants;

const isVariant = (value: string | null): value is VariantId =>
  value !== null && Object.hasOwn(variants, value);

function apply(id: VariantId) {
  const variant = variants[id];
  const root = document.documentElement;
  if (variant.css && !document.querySelector(`link[data-dev-font="${id}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${variant.css}&display=swap`;
    link.dataset.devFont = id;
    document.head.append(link);
  }
  if (variant.family) root.style.setProperty("font-family", variant.family);
  else root.style.removeProperty("font-family");
  root.dataset.devFont = id;
  try {
    if (id === "today") localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, id);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this page only.
  }
}

function mountSwitcher(current: VariantId) {
  const bar = document.createElement("div");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Typeface preview");
  bar.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:2000;display:flex;gap:4px;padding:4px;" +
    "border:1px solid var(--theme-border-strong);border-radius:8px;background:var(--theme-surface);" +
    "box-shadow:0 6px 18px -8px rgb(16 24 40 / 30%);font:600 12px/1 " +
    fallback;
  const select = (id: VariantId) => {
    apply(id);
    for (const button of bar.querySelectorAll<HTMLButtonElement>("button")) {
      const on = button.dataset.devFontOption === id;
      button.setAttribute("aria-pressed", String(on));
      button.style.background = on
        ? "var(--theme-accent)"
        : "var(--theme-surface)";
      button.style.color = on ? "var(--theme-on-accent)" : "var(--theme-text)";
    }
  };
  for (const [id, variant] of Object.entries(variants)) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = variant.label;
    button.dataset.devFontOption = id;
    button.style.cssText =
      "border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font:inherit;";
    button.addEventListener("click", () => select(id as VariantId));
    bar.append(button);
  }
  document.body.append(bar);
  select(current);
}

const param = new URLSearchParams(location.search).get("font");
let stored: string | null = null;
try {
  stored = localStorage.getItem(storageKey);
} catch {
  stored = null;
}
const initial: VariantId = isVariant(param)
  ? param
  : isVariant(stored)
    ? stored
    : "today";
if (param !== null || stored !== null) mountSwitcher(initial);

export {};
