// Privacy choices for this website. Today the site loads no analytics,
// advertising or other optional technology, so there is nothing to opt in
// to: the notice says so, and the choices panel shows those categories as
// "not used". If optional technology is added later, it must be listed in
// OPTIONAL_TECHNOLOGY and loaded only through whenAllowed().

export type OptionalCategory = "analytics" | "marketing";

export type ConsentRecord = {
  readonly version: 1;
  readonly decidedAt: string;
  readonly analytics: boolean;
  readonly marketing: boolean;
};

/** What the site actually loads per category. Empty = not used. */
export const OPTIONAL_TECHNOLOGY: Readonly<Record<OptionalCategory, readonly string[]>> = {
  analytics: [],
  marketing: [],
};

export const STORAGE_KEY = "nf-privacy-choices";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked storage (private mode, policies)
  }
}

export function categoryInUse(category: OptionalCategory): boolean {
  return OPTIONAL_TECHNOLOGY[category].length > 0;
}

export function anyOptionalInUse(): boolean {
  return categoryInUse("analytics") || categoryInUse("marketing");
}

/** Global Privacy Control: a browser-level "do not sell or share" signal we honor. */
export function globalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

export function parseConsent(raw: string | null): ConsentRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ConsentRecord>;
    if (value.version !== 1 || typeof value.decidedAt !== "string") return null;
    return {
      version: 1,
      decidedAt: value.decidedAt,
      analytics: value.analytics === true,
      marketing: value.marketing === true,
    };
  } catch {
    return null;
  }
}

export function readConsent(store: StorageLike | null = storage()): ConsentRecord | null {
  try {
    return parseConsent(store?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function writeConsent(
  choices: { analytics: boolean; marketing: boolean },
  store: StorageLike | null = storage(),
  now: Date = new Date(),
): ConsentRecord {
  const record: ConsentRecord = {
    version: 1,
    decidedAt: now.toISOString(),
    // A category nothing uses cannot be "on"; GPC always wins.
    analytics: choices.analytics && categoryInUse("analytics") && !globalPrivacyControl(),
    marketing: choices.marketing && categoryInUse("marketing") && !globalPrivacyControl(),
  };
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage blocked: the choice still applies for this page view.
  }
  listeners.forEach((listener) => listener());
  return record;
}

export function allowed(category: OptionalCategory, record: ConsentRecord | null = readConsent()): boolean {
  if (!categoryInUse(category) || globalPrivacyControl()) return false;
  return record?.[category] === true;
}

/**
 * The only door for optional scripts: runs `load` once the visitor has
 * allowed `category` (now or later in the session).
 */
export function whenAllowed(category: OptionalCategory, load: () => void): () => void {
  let done = false;
  const attempt = () => {
    if (!done && allowed(category)) {
      done = true;
      load();
    }
  };
  attempt();
  return subscribeConsent(attempt);
}

/** Opening and closing the choices panel from anywhere (footer link, notice). */
const panelListeners = new Set<(open: boolean) => void>();
export function openPrivacyChoices(): void {
  panelListeners.forEach((listener) => listener(true));
}
export function onPrivacyPanel(listener: (open: boolean) => void): () => void {
  panelListeners.add(listener);
  return () => panelListeners.delete(listener);
}
