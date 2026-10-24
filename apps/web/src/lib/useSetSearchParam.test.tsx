import { act, render } from "@testing-library/react";
import { Suspense } from "react";
import { MemoryRouter, useLocation, useSearchParams } from "react-router";
import { describe, expect, it } from "vitest";

import { useSetSearchParam } from "./useSetSearchParam";

// The router moves to a new address inside a transition: until the page has rendered it, the page still holds the
// previous address. A page that waits for the new day stays on the old render, as a busy phone Lineup does (CI
// 40082125411: › to the next day, then the Location menu wrote the day before back).
let ready = false;
let release: () => void = () => undefined;
const held = new Promise<void>((resolve) => {
  release = () => {
    ready = true;
    resolve();
  };
});
function DayBody({ date }: { readonly date: string | null }) {
  if (date === "2041-01-03" && !ready) throw held;
  return <p>{date}</p>;
}

const handles: { setParam?: (key: string, value: string) => void; search?: string } = {};
function Page() {
  const [params] = useSearchParams();
  handles.setParam = useSetSearchParam();
  return (
    <Suspense fallback={<p>loading</p>}>
      <DayBody date={params.get("date")} />
    </Suspense>
  );
}

function Address() {
  handles.search = useLocation().search;
  return null;
}

describe("useSetSearchParam", () => {
  it("keeps a day the page has not rendered yet when another key is set from the old render", async () => {
    render(
      <MemoryRouter initialEntries={["/app/schedule/lineup?date=2041-01-02&shift=dinner"]}>
        <Page />
        <Address />
      </MemoryRouter>,
    );
    const fromOldRender = handles.setParam!;

    await act(async () => fromOldRender("date", "2041-01-03"));
    await act(async () => fromOldRender("location", "kadikoy"));

    // The new day is ready: the router lands on the address the two steps left.
    await act(async () => release());
    const live = new URLSearchParams(handles.search);
    expect(live.get("location")).toBe("kadikoy");
    expect(live.get("date")).toBe("2041-01-03");
    expect(live.get("shift")).toBe("dinner");
  });

  it("removes a key set to nothing", async () => {
    render(
      <MemoryRouter initialEntries={["/app/schedule/lineup?date=2041-01-02&shift=dinner"]}>
        <Page />
        <Address />
      </MemoryRouter>,
    );
    await act(async () => handles.setParam!("shift", ""));
    expect(new URLSearchParams(handles.search).get("shift")).toBeNull();
    expect(new URLSearchParams(handles.search).get("date")).toBe("2041-01-02");
  });
});
