import { useMemo, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppSidebarPanelContext } from "../../shell/AppSidebarPanel";
import { ExportSettingsPanel } from "./ExportSettingsPanel";
import { defaultExportPreferences } from "./preferences";
import type { SnapshotResult } from "./snapshot";

function Harness({ result = { status: "blocked", reason: "loading" }, initiallyCollapsed = false }: { result?: SnapshotResult; initiallyCollapsed?: boolean }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  const [preferences, setPreferences] = useState(defaultExportPreferences);
  const host = useMemo(() => ({ target, collapsed, setCollapsed, setOwner }), [target, collapsed]);
  return <MemoryRouter><AppSidebarPanelContext.Provider value={host}>
    <div data-testid="shell" data-sidebar-collapsed={owner ? collapsed : initiallyCollapsed}>
      <aside aria-label="Application sidebar">{owner ? <div ref={setTarget} /> : <nav>Normal navigation</nav>}</aside>
      <main><button onClick={() => setOpen(true)}>Open export</button>
        <button onClick={() => setClicks(count => count + 1)}>Grid filter {clicks}</button>
        {open ? <ExportSettingsPanel result={result} preferences={preferences} onChange={setPreferences}
          onReset={() => setPreferences(defaultExportPreferences)} onClose={() => setOpen(false)}
          onPreview={vi.fn()} onExport={vi.fn()} busy={false} error={null} canManageLocations
          inline={{ files: [], loading: false }} onInlineTarget={() => undefined} /> : null}
      </main>
    </div>
  </AppSidebarPanelContext.Provider></MemoryRouter>;
}

describe("nonmodal export sidebar", () => {
  it("occupies the sidebar, supports rail minimization, restores navigation width and never blocks grid buttons", () => {
    render(<Harness initiallyCollapsed />);
    fireEvent.click(screen.getByText("Open export"));
    const panel = screen.getByRole("region", { name: "Export settings" });
    expect(panel.closest("aside")).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByTestId("shell").getAttribute("data-sidebar-collapsed")).toBe("false");
    fireEvent.click(screen.getByText("Grid filter 0"));
    expect(screen.getByText("Grid filter 1")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Minimize export settings"));
    expect(screen.getByTestId("shell").getAttribute("data-sidebar-collapsed")).toBe("true");
    expect(screen.queryByText("Normal navigation")).toBeNull();
    fireEvent.click(screen.getByLabelText("Expand export settings"));
    fireEvent.click(screen.getByLabelText("Close export"));
    expect(screen.getByText("Normal navigation")).toBeTruthy();
    expect(screen.getByTestId("shell").getAttribute("data-sidebar-collapsed")).toBe("true");
  });
  it("blocks generation while the source loads and does not add independent grid filters", () => {
    render(<Harness />); fireEvent.click(screen.getByText("Open export"));
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Waiting for the current preview…")).toBeTruthy();
    expect(screen.queryByText("Source")).toBeNull();
  });
  it("lists missing short names and offers the canonical settings route", () => {
    render(<Harness result={{ status: "blocked", reason: "short_names", locationNames: ["Garden"] }} />);
    fireEvent.click(screen.getByText("Open export"));
    expect(screen.getByText("Garden")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Location Settings" }).getAttribute("href")).toBe("/app/settings/locations");
  });
  it("keeps print controls separate and Excel does not offer print or compression controls", () => {
    render(<Harness />); fireEvent.click(screen.getByText("Open export"));
    fireEvent.click(screen.getByRole("radio", { name: /^Print/ }));
    expect(screen.getByRole("radiogroup", { name: "Paper" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /One long page/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Print PDF" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Excel/ }));
    expect(screen.queryByRole("radiogroup", { name: "Paper" })).toBeNull();
    expect(screen.queryByRole("radio", { name: /^Print/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeTruthy();
  });
});
