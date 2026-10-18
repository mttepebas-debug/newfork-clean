import { cleanup, render, screen } from "@testing-library/react";
import { MapPin } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsListHeader } from "./SettingsListHeader";

function media(matches: boolean) {
  return (query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function renderHeader() {
  return render(
    <SettingsListHeader
      icon={<MapPin size={21} aria-hidden />}
      title="Locations"
      titleId="locations-settings-title"
      description="Restaurant addresses."
    />,
  );
}

describe("Settings list page heading (Mert 2026-10-18: desktop only)", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("is General's heading on a computer", () => {
    vi.stubGlobal("matchMedia", media(false));
    const { container } = renderHeader();
    expect(container.querySelector(".settings-page-header .settings-heading-icon")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("locations-settings-title");
    expect(screen.queryByText("SETTINGS")).toBeNull();
  });

  it("keeps the list heading on a phone", () => {
    vi.stubGlobal("matchMedia", media(true));
    const { container } = renderHeader();
    expect(container.querySelector(".catalog-page-header")).toBeTruthy();
    expect(container.querySelector(".settings-heading-icon")).toBeNull();
    expect(screen.getByText("SETTINGS")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).id).toBe("locations-settings-title");
  });
});
