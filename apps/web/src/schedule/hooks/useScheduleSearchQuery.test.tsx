import { act, render } from "@testing-library/react";
import { Suspense } from "react";
import { BrowserRouter, useSearchParams } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { useSetScheduleSearchQuery } from "./useScheduleSearchQuery";

// The router moves to a new address inside a transition: until the page has
// rendered it, the page still holds the previous address. A page that waits
// for the new week's data stays on the old render, as a slow grid does.
const neverReady = new Promise<never>(() => undefined);
function WeekBody({ date }: { readonly date: string | null }) {
  if (date === "2043-02-02") throw neverReady;
  return <p>{date}</p>;
}

const handles: {
  previousWeek?: () => void;
  setQuery?: (value: string) => void;
} = {};
function Page() {
  const [search, setSearch] = useSearchParams();
  const setQuery = useSetScheduleSearchQuery();
  handles.previousWeek = () => {
    const next = new URLSearchParams(search);
    next.set("date", "2043-02-02");
    setSearch(next);
  };
  handles.setQuery = setQuery;
  return (
    <Suspense fallback={<p>loading</p>}>
      <WeekBody date={search.get("date")} />
    </Suspense>
  );
}

afterEach(() => window.history.replaceState(null, "", "/"));

describe("useSetScheduleSearchQuery", () => {
  it("keeps a week step the page has not rendered yet", async () => {
    window.history.replaceState(null, "", "/app/schedule?date=2043-02-09&q=emre&view=week");
    render(
      <BrowserRouter>
        <Page />
      </BrowserRouter>,
    );
    const sendFromOldRender = handles.setQuery!;

    await act(async () => handles.previousWeek!());
    expect(window.location.search).toContain("date=2043-02-02");

    // The search typed a moment before reaches the address after its pause,
    // from the render that still shows the earlier week.
    await act(async () => sendFromOldRender("cook"));

    const live = new URLSearchParams(window.location.search);
    expect(live.get("date")).toBe("2043-02-02");
    expect(live.get("q")).toBe("cook");
    expect(live.get("view")).toBe("week");
  });
});
