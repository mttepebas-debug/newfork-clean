import { useSyncExternalStore } from "react";

// ponytail: DEV-only design comparison (account redesign). Delete this file,
// its two uses in AccountLayout and the unpicked [data-account-variant] blocks
// in account.css once a variant is chosen.
const variants = ["a", "b", "c"] as const;
type Variant = (typeof variants)[number];
const key = "account-variant";
const event = "account-variant-change";

function read(): Variant {
  const fromUrl = new URLSearchParams(window.location.search).get("variant");
  if (variants.includes(fromUrl as Variant)) {
    try { sessionStorage.setItem(key, fromUrl!); } catch { /* private mode */ }
    return fromUrl as Variant;
  }
  try {
    const stored = sessionStorage.getItem(key);
    if (variants.includes(stored as Variant)) return stored as Variant;
  } catch { /* private mode */ }
  return "a";
}

function subscribe(onChange: () => void) {
  window.addEventListener(event, onChange);
  return () => window.removeEventListener(event, onChange);
}

export function useAccountVariant(): Variant | undefined {
  const variant = useSyncExternalStore(subscribe, read, () => "a" as Variant);
  return import.meta.env.DEV ? variant : undefined;
}

const names: Record<Variant, string> = {
  a: "A · Settings rows",
  b: "B · Section cards",
  c: "C · Narrow flow",
};

export function AccountVariantSwitcher() {
  const current = useAccountVariant();
  if (!current) return null;
  const pick = (variant: Variant) => {
    try { sessionStorage.setItem(key, variant); } catch { /* private mode */ }
    const url = new URL(window.location.href);
    url.searchParams.set("variant", variant);
    window.history.replaceState(window.history.state, "", url);
    window.dispatchEvent(new Event(event));
  };
  return (
    <div className="account-variant-switcher" role="group" aria-label="Design variant (development only)">
      {variants.map((variant) => (
        <button
          key={variant}
          type="button"
          aria-pressed={variant === current}
          title={names[variant]}
          onClick={() => pick(variant)}
        >
          {names[variant]}
        </button>
      ))}
    </div>
  );
}
