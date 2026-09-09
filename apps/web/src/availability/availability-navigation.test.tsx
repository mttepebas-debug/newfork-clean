// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  leaveAvailability,
  useAvailabilityNavigationGuard,
  type AvailabilityNavigationRef,
  AvailabilityDraftScope,
  requestAvailabilityNavigation,
} from "./availability-navigation";
import { registerEmployeeHistoryGuard } from "../employees/employee-history-guard";

function ScopedDraft({name,busy = false}:{name:string;busy?:boolean}) {
  const [value,setValue] = useState("");
  const dialog = useAvailabilityNavigationGuard({dirty:Boolean(value),busy,onDiscard:()=>setValue("")});
  return <><input aria-label={name} value={value} onChange={event=>setValue(event.target.value)} />{dialog}</>;
}
function MultipleDrafts({navigate,busy = false}:{navigate:()=>void;busy?:boolean}) {
  return <AvailabilityDraftScope>
    <ScopedDraft name="Weekly draft" /><ScopedDraft name="Leave draft" busy={busy} /><ScopedDraft name="Cancellation draft" />
    <button onClick={()=>requestAvailabilityNavigation(navigate)}>Sign out</button>
  </AvailabilityDraftScope>;
}

function Host({
  dirty = false,
  busy = false,
  navigate = vi.fn(),
}: {
  dirty?: boolean;
  busy?: boolean;
  navigate?: () => void;
}) {
  const ref: AvailabilityNavigationRef = useRef(null);
  const dialog = useAvailabilityNavigationGuard({
    dirty,
    busy,
    navigationRef: ref,
  });
  return (
    <>
      <input aria-label="Hours" defaultValue="10:00–17:00" />
      <button onClick={() => leaveAvailability(ref, navigate)}>Leave</button>
      <a href="/different-page">Schedule</a>
      <a href="/report" target="_blank">
        New tab
      </a>
      <a href="/report" download>
        Download
      </a>
      {dialog}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("availability navigation protection", () => {
  it("preserves three simultaneous drafts on Stay and discards all with one departure decision", () => {
    const navigate = vi.fn();
    render(<MultipleDrafts navigate={navigate} />);
    for (const name of ["Weekly draft","Leave draft","Cancellation draft"]) fireEvent.change(screen.getByLabelText(name),{target:{value:name}});
    fireEvent.click(screen.getByText("Sign out"));
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    expect(screen.getByText("Discard availability and time off changes?")).toBeTruthy();
    fireEvent.click(screen.getByText("Stay here"));
    for (const name of ["Weekly draft","Leave draft","Cancellation draft"]) expect(screen.getByLabelText(name)).toHaveProperty("value",name);
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sign out"));
    fireEvent.click(screen.getByText("Discard and leave"));
    for (const name of ["Weekly draft","Leave draft","Cancellation draft"]) expect(screen.getByLabelText(name)).toHaveProperty("value","");
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("blocks the combined departure while any form is saving", () => {
    const navigate = vi.fn();
    const view = render(<MultipleDrafts navigate={navigate} busy />);
    fireEvent.change(screen.getByLabelText("Weekly draft"),{target:{value:"Monday off"}});
    fireEvent.click(screen.getByText("Sign out"));
    expect(screen.getByText("Saving availability or time off")).toBeTruthy();
    expect(screen.getByText("Discard and leave")).toHaveProperty("disabled",true);
    expect(navigate).not.toHaveBeenCalled();
    view.rerender(<MultipleDrafts navigate={navigate} />);
    fireEvent.click(screen.getByText("Stay here"));
    expect(screen.getByLabelText("Weekly draft")).toHaveProperty("value","Monday off");
  });
  it("restores the prior history guard after a nested form unregisters", () => {
    const prior = vi.fn((event:PopStateEvent)=>event.stopImmediatePropagation());
    const nested = vi.fn((event:PopStateEvent)=>event.stopImmediatePropagation());
    const unregisterPrior = registerEmployeeHistoryGuard(prior);
    const unregisterNested = registerEmployeeHistoryGuard(nested);
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(nested).toHaveBeenCalledOnce(); expect(prior).not.toHaveBeenCalled();
    unregisterNested();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(prior).toHaveBeenCalledOnce();
    unregisterPrior();
  });
  it("lets an untouched form leave without prompting", () => {
    const navigate = vi.fn();
    render(<Host navigate={navigate} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(navigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  it("preserves the draft on Stay/Escape and runs the selected navigation only after discard", () => {
    const navigate = vi.fn();
    render(<Host dirty navigate={navigate} />);
    fireEvent.change(screen.getByLabelText("Hours"), {
      target: { value: "12:00–16:00" },
    });
    screen.getByText("Leave").focus();
    fireEvent.click(screen.getByText("Leave"));
    expect(navigate).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByText("Stay here"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByText("Leave"));
    expect((screen.getByLabelText("Hours") as HTMLInputElement).value).toBe(
      "12:00–16:00",
    );
    fireEvent.click(screen.getByText("Leave"));
    fireEvent.click(screen.getByText("Stay here"));
    fireEvent.click(screen.getByText("Leave"));
    fireEvent.click(screen.getByText("Discard and leave"));
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("blocks departure during a save and allows continuing after its result", () => {
    const navigate = vi.fn();
    const view = render(<Host dirty busy navigate={navigate} />);
    fireEvent.click(screen.getByText("Leave"));
    expect(
      (screen.getByText("Discard and leave") as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByText("Discard and leave"));
    expect(navigate).not.toHaveBeenCalled();
    view.rerender(<Host navigate={navigate} />);
    expect(screen.getByText("Availability saved")).toBeTruthy();
    fireEvent.click(screen.getByText("Continue"));
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("guards same-tab links but leaves new-tab, downloads and modified clicks alone", () => {
    render(<Host dirty />);
    // Prevent jsdom's own navigation; capture protection still sees the event first.
    const suppress = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("click", suppress);
    fireEvent.click(screen.getByText("New tab"));
    fireEvent.click(screen.getByText("Download"));
    fireEvent.click(screen.getByText("Schedule"), { ctrlKey: true });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByText("Schedule"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    document.removeEventListener("click", suppress);
  });
  it("warns before refresh only while unsaved or saving", () => {
    const view = render(<Host dirty />);
    const warn = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(warn);
    expect(warn.defaultPrevented).toBe(true);
    view.rerender(<Host />);
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
  it("restores Back before router listeners see it and waits for restoration before allowing discard", () => {
    window.history.replaceState({ idx: 1 }, "");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => {});
    render(<Host dirty />);
    const router = vi.fn();
    window.addEventListener("popstate", router);
    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { idx: 0 } }),
      ),
    );
    expect(go).toHaveBeenCalledWith(1);
    expect(router).not.toHaveBeenCalled();
    expect(
      (screen.getByText("Discard and leave") as HTMLButtonElement).disabled,
    ).toBe(true);
    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { idx: 1 } }),
      ),
    );
    expect(router).not.toHaveBeenCalled();
    expect(
      (screen.getByText("Discard and leave") as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByText("Discard and leave"));
    expect(go).toHaveBeenLastCalledWith(-1);
    act(() =>
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { idx: 0 } }),
      ),
    );
    expect(router).toHaveBeenCalledOnce();
    window.removeEventListener("popstate", router);
  });
});
