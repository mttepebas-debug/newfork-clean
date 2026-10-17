import { render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePhonePageMenu } from "./usePhonePageMenu";

// MOBIL-BASLIK (Mert 2026-10-17): on a phone Settings' and Account's menu sits
// under the page heading's line. jsdom lays nothing out, so this reads where
// the menu lands in the heading; the line itself is e2e/flows/phone-page-top.spec.ts.
function Page({ tabs }: { tabs: boolean }) {
  const [area, setArea] = useState<HTMLElement | null>(null);
  const slot = usePhonePageMenu(area);
  return (
    <main ref={setArea}>
      <header className="settings-page-header">
        <div>
          <h1>Acknowledgements</h1>
        </div>
        {tabs ? (
          <div>
            <div role="tablist" aria-label="Acknowledgements" />
          </div>
        ) : null}
      </header>
      {slot ? createPortal(<nav aria-label="Workspace settings" />, slot) : null}
    </main>
  );
}

describe("the phone page menu", () => {
  const phone = (matches: boolean) =>
    vi.stubGlobal("matchMedia", () => ({ matches, addEventListener: () => undefined, removeEventListener: () => undefined }));
  beforeEach(() => phone(true));
  afterEach(() => vi.unstubAllGlobals());

  // Screen readers and Tab reach it where it is drawn: above the heading's own tabs (WCAG 2.4.3).
  it("comes before the heading's own tabs", async () => {
    const { container } = render(<Page tabs />);
    const menu = await waitFor(() => container.querySelector<HTMLElement>('nav[aria-label="Workspace settings"]')!);
    const tablist = container.querySelector('[role="tablist"]')!;
    expect(menu.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(menu.closest("header")).toBe(tablist.closest("header"));
  });

  it("ends the heading when it has no tabs", async () => {
    const { container } = render(<Page tabs={false} />);
    const menu = await waitFor(() => container.querySelector<HTMLElement>('nav[aria-label="Workspace settings"]')!);
    expect(menu.parentElement?.className).toBe("phone-page-menu");
    expect(menu.parentElement?.nextElementSibling).toBeNull();
  });

  it("stays out of the heading on a computer", () => {
    phone(false);
    const { container } = render(<Page tabs />);
    expect(container.querySelector(".phone-page-menu")).toBeNull();
    expect(container.querySelector('nav[aria-label="Workspace settings"]')).toBeNull();
  });
});
