import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ExportSettingsPanel } from "./ExportSettingsPanel";
import type { ExportDownload } from "./files";
import { defaultExportPreferences } from "./preferences";
import type { ScheduleExportSnapshot, SnapshotResult } from "./snapshot";

function Harness({ result = { status: "blocked", reason: "loading" }, files = [] }: { result?: SnapshotResult; files?: readonly ExportDownload[] }) {
  const [preferences, setPreferences] = useState({ ...defaultExportPreferences, combineHorizontally: false });
  return <MemoryRouter>
    <ExportSettingsPanel result={result} preferences={preferences} onChange={setPreferences}
      onPreview={vi.fn()} onExport={vi.fn()} busy={false} error={null} canManageLocations
      inline={{ files, loading: false }} onInlineTarget={() => undefined} />
  </MemoryRouter>;
}

const preview = vi.hoisted(() => ({ renderPdfPreviewPages: vi.fn() }));
vi.mock("./png", () => preview);

const ready = (source: ScheduleExportSnapshot["source"]): SnapshotResult => ({
  status: "ready",
  snapshot: {
    source, dates: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"],
    locations: [{ id: "l1", name: "Downtown" }, { id: "l2", name: "Uptown" }], rows: [{ id: "e1" }, { id: "e2" }, { id: null }], shifts: [{ id: "s1" }],
    layout: "separate",
  } as unknown as ScheduleExportSnapshot,
});

describe("Export in the New Schedule window", () => {
  it("blocks generation while the source loads", () => {
    render(<Harness />);
    expect(screen.getByRole("region", { name: "Export settings" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Open in a tab" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Waiting for the current preview…")).toBeTruthy();
  });
  it("says in one line what it exports: the grid as it is, never a source choice (Mert, 2026-10-12)", () => {
    const { unmount } = render(<Harness result={ready({ kind: "published" })} />);
    expect(screen.getByText("Published").closest("p")?.textContent).toBe("Published · Oct 12 – Oct 18 · 2 locations · 2 employees · 1 shift");
    unmount();
    render(<Harness result={ready({ kind: "edit_session", id: "s", revision: 2, draftName: null })} />);
    expect(screen.getByText("Editing · not saved")).toBeTruthy();
    expect(screen.queryByRole("radiogroup", { name: /source/i })).toBeNull();
  });
  it("lists missing short names and offers the canonical settings route", () => {
    render(<Harness result={{ status: "blocked", reason: "short_names", locationNames: ["Garden"] }} />);
    expect(screen.getByText("Garden")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Location Settings" }).getAttribute("href")).toBe("/app/settings/locations");
  });
  it("keeps print controls separate and Excel does not offer print or layout controls", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Printer" }));
    expect(screen.getByRole("radiogroup", { name: "Paper" })).toBeTruthy();
    expect(screen.queryByRole("switch", { name: /One long page/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Print PDF" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Excel/ }));
    expect(screen.queryByRole("radiogroup", { name: "Paper" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Printer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeTruthy();
  });
  it("turns layout options on and off as switches", () => {
    render(<Harness />);
    const longPage = screen.getByRole("switch", { name: /One long page/ });
    const before = longPage.getAttribute("aria-checked");
    fireEvent.click(longPage);
    expect(longPage.getAttribute("aria-checked")).not.toBe(before);
  });
  it("shows every page whole, names its location, says how the week splits and zooms to actual size (3P #62)", async () => {
    preview.renderPdfPreviewPages.mockResolvedValue([
      { blob: new Blob(["1"]), width: 1160, height: 793, lines: ["Meyhouse", "Downtown", "Employee"] },
      { blob: new Blob(["2"]), width: 1160, height: 793, lines: ["Meyhouse", "Uptown", "Employee"] },
    ]);
    const createObjectURL = vi.fn((blob: Blob) => `blob:page-${blob.size}-${createObjectURL.mock.calls.length}`);
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const pdf = { name: "week.pdf", blob: new Blob(["pdf"]), url: "blob:pdf" };
    render(<Harness result={ready({ kind: "published" })} files={[pdf]} />);
    await act(async () => undefined);
    const box = screen.getByRole("group", { name: "Export preview" });
    expect(preview.renderPdfPreviewPages).toHaveBeenCalledWith(pdf.blob);
    expect(box.textContent).toContain("Page 1 of 2 · Downtown");
    expect(box.textContent).toContain("One location per page · one long page");
    const page = screen.getByRole("img", { name: "Page 1 of 2 · Downtown" });
    expect(page.getAttribute("style") ?? "").not.toContain("width");
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(box.textContent).toContain("Page 2 of 2 · Uptown");
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
    const zoom = screen.getByRole("button", { name: "Actual size" });
    expect(zoom.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(zoom);
    expect(zoom.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("img", { name: "Page 2 of 2 · Uptown" }).style.width).toBe("1160px");
  });
});
