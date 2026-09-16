import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { ExportSettingsPanel } from "./ExportSettingsPanel";
import { ExportController } from "./ExportController";
import { authorizeScheduleExportV2 } from "../schedule-data";
import { downloadExportFile, renderExportFiles } from "./files";
import type { ScheduleExportSnapshot, SnapshotResult } from "./snapshot";

vi.mock("../schedule-data", () => ({ authorizeScheduleExportV2: vi.fn() }));
vi.mock("./files", async original => ({ ...await original<typeof import("./files")>(), renderExportFiles: vi.fn(), downloadExportFile: vi.fn() }));
vi.mock("./ExportSettingsPanel", () => ({ ExportSettingsPanel: (props: ComponentProps<typeof ExportSettingsPanel>) => <div>
  <button disabled={props.busy || props.result.status !== "ready"} onClick={props.onExport}>Export</button>
  <button onClick={props.onPreview}>Preview</button>
  <button onClick={() => props.onChange({ ...props.preferences, format: "png" })}>PNG</button>
  <span>{props.preferences.format}</span><p>{props.error}</p>{props.footer}
</div> }));

function source(name = "first"): SnapshotResult {
  const snapshot: ScheduleExportSnapshot = { version: 1, workspaceId: "workspace", workspaceName: "Workspace", weekStart: "2026-09-14",
    source: { kind: "published" }, dates: ["2026-09-14"], layout: "unified", locations: [{ id: "location", name: "Main", shortName: "MAIN" }],
    rows: [], shifts: [], filename: name };
  return { status: "ready", snapshot };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const props = { userId: "user", workspaceId: "workspace", onClose: vi.fn(), canManageLocations: true };
const file = { name: "first.pdf", blob: new Blob(["pdf"]) };

beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear();
  vi.mocked(authorizeScheduleExportV2).mockResolvedValue(undefined);
  vi.mocked(renderExportFiles).mockResolvedValue([file]);
  let index = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test-${++index}`), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Export v2 delivery lifecycle", () => {
  it("does not render or download when initial authorization fails", async () => {
    vi.mocked(authorizeScheduleExportV2).mockRejectedValueOnce(new Error("Access denied"));
    render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Export"));
    await screen.findByText("Access denied");
    expect(renderExportFiles).not.toHaveBeenCalled(); expect(downloadExportFile).not.toHaveBeenCalled();
  });
  it("rechecks authority after generation and never exposes a revoked result", async () => {
    vi.mocked(authorizeScheduleExportV2).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Revoked"));
    render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Export"));
    await screen.findByText("Revoked"); expect(renderExportFiles).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(downloadExportFile).not.toHaveBeenCalled();
  });
  it("freezes the click's source/preferences while a different preview becomes active", async () => {
    const pending = deferred<readonly typeof file[]>(); vi.mocked(renderExportFiles).mockReturnValueOnce(pending.promise);
    const first = source(); const view = render(<ExportController {...props} result={first} />);
    fireEvent.click(screen.getByText("Export")); await waitFor(() => expect(renderExportFiles).toHaveBeenCalledOnce());
    view.rerender(<ExportController {...props} result={source("second")} />); fireEvent.click(screen.getByText("PNG"));
    await act(async () => pending.resolve([file]));
    expect(renderExportFiles).toHaveBeenCalledWith(first.status === "ready" ? first.snapshot : null, expect.objectContaining({ format: "pdf" }));
    expect(downloadExportFile).toHaveBeenCalledWith(expect.objectContaining({ name: "first.pdf" }));
    expect(screen.getByText("png")).toBeTruthy();
  });
  it("aborts and suppresses a generation after workspace/source disposal", async () => {
    const pending = deferred<readonly typeof file[]>(); vi.mocked(renderExportFiles).mockReturnValueOnce(pending.promise);
    const view = render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Export"));
    await waitFor(() => expect(renderExportFiles).toHaveBeenCalledOnce());
    const signal = vi.mocked(authorizeScheduleExportV2).mock.calls[0]![2]!;
    view.unmount(); await act(async () => pending.resolve([file]));
    expect(signal.aborted).toBe(true); expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(downloadExportFile).not.toHaveBeenCalled();
  });
  it("revokes replaced downloads, rechecks fallback download, and cleans the last URL on unmount", async () => {
    const view = render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Export"));
    await screen.findByRole("button", { name: "first.pdf" });
    fireEvent.click(screen.getByRole("button", { name: "first.pdf" })); await waitFor(() => expect(authorizeScheduleExportV2).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByText("Export")); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1");
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });
  it("keeps direct download usable when a preview popup is blocked", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Preview"));
    expect(screen.getByText(/blocked the preview tab/)).toBeTruthy();
    fireEvent.click(screen.getByText("Export")); await waitFor(() => expect(downloadExportFile).toHaveBeenCalledOnce());
  });
  it("updates the same new-tab preview, removes stale output while loading, then closes and revokes it", async () => {
    const childDocument = document.implementation.createHTMLDocument();
    const child = { document: childDocument, opener: window, closed: false, close: vi.fn(), focus: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(child as unknown as Window);
    const view = render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(childDocument.querySelector("iframe")?.getAttribute("src")).toBe("blob:test-1#view=FitH"));
    expect(child.opener).toBeNull();
    view.rerender(<ExportController {...props} result={{ status: "blocked", reason: "loading" }} />);
    expect(childDocument.querySelector("iframe")).toBeNull();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1"));
    view.rerender(<ExportController {...props} result={source("second")} />);
    await waitFor(() => expect(childDocument.querySelector("iframe")?.getAttribute("src")).toBe("blob:test-2#view=FitH"));
    expect(window.open).toHaveBeenCalledOnce(); view.unmount();
    expect(child.close).toHaveBeenCalledOnce(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
  });
  it("keeps the last preview on screen and renders once more with the latest input while a render is in flight", async () => {
    const childDocument = document.implementation.createHTMLDocument();
    const child = { document: childDocument, opener: window, closed: false, close: vi.fn(), focus: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(child as unknown as Window);
    const view = render(<ExportController {...props} result={source()} />); fireEvent.click(screen.getByText("Preview"));
    await waitFor(() => expect(childDocument.querySelector("iframe")?.getAttribute("src")).toBe("blob:test-1#view=FitH"));
    const pending = deferred<readonly typeof file[]>(); vi.mocked(renderExportFiles).mockReturnValueOnce(pending.promise);
    view.rerender(<ExportController {...props} result={source("second")} />);
    await waitFor(() => expect(renderExportFiles).toHaveBeenCalledTimes(2));
    expect(childDocument.querySelector("iframe")?.getAttribute("src")).toBe("blob:test-1#view=FitH");
    expect(childDocument.querySelector("[role=status]")?.textContent).toContain("Updating");
    view.rerender(<ExportController {...props} result={source("third")} />);
    view.rerender(<ExportController {...props} result={source("fourth")} />);
    await new Promise(resolve => setTimeout(resolve, 500));
    expect(renderExportFiles).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve([file]));
    await waitFor(() => expect(renderExportFiles).toHaveBeenCalledTimes(3));
    expect(vi.mocked(renderExportFiles).mock.calls[2]![0].filename).toBe("fourth");
    await waitFor(() => expect(childDocument.querySelector("iframe")?.getAttribute("src")).toBe("blob:test-3#view=FitH"));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-1"); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-2");
    view.unmount();
  });
});
