import { vi } from "vitest";

/** Tests only: makes `window.matchMedia` answer that the list pages' phone
 * layout (720 px and below) is on; other queries stay off. Undo with
 * `vi.unstubAllGlobals()`. */
export function stubPhoneWidth(): void {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: media === "(max-width: 720px)",
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}
