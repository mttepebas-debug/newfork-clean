import { vi } from "vitest";

/** Tests only: makes `window.matchMedia` answer like a phone-wide (390 px)
 * window. Undo with `vi.unstubAllGlobals()`. */
export function stubPhoneWidth(): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: /max-width:\s*(720|767)px/.test(media),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
