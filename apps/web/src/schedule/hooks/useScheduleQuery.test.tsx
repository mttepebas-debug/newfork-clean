import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ScheduleDataModule from "../schedule-data";
import { getScheduleReadModel, scheduleReadKey } from "../schedule-data";
import { useScheduleQuery } from "./useScheduleQuery";

vi.mock("../schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof ScheduleDataModule>();
  return {
    ...actual,
    getScheduleReadModel: vi.fn(),
  };
});

const getScheduleReadModelMock = vi.mocked(getScheduleReadModel);

const readModel = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-05-04",
  week_start_day: "monday",
  settings: { time_format: "12h" },
  locations: [],
  departments: [],
  jobs: [],
  shift_types: [],
  shift_labels: [],
  employees: [],
  shifts: [],
  closures: [],
  important_dates: [],
} satisfies ScheduleReadModel;

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  getScheduleReadModelMock.mockReset();
  getScheduleReadModelMock.mockResolvedValue(readModel);
});

describe("useScheduleQuery", () => {
  it("does not fetch schedule data while disabled", () => {
    renderHook(
      () => useScheduleQuery("workspace", "2026-05-04", "week", { enabled: false }),
      {
        wrapper: wrapper(),
      },
    );

    expect(getScheduleReadModelMock).not.toHaveBeenCalled();
  });

  it("fetches the schedule read model with the selected date and view", async () => {
    const { result } = renderHook(
      () => useScheduleQuery("workspace", "2026-05-04", "day"),
      {
        wrapper: wrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getScheduleReadModelMock).toHaveBeenCalledWith(
      "workspace",
      "2026-05-04",
      "day",
    );
    expect(result.current.data).toEqual(readModel);
  });

  it("uses the documented read-model query key", () => {
    expect(scheduleReadKey("workspace", "2026-05-04", "week")).toEqual([
      "schedule-read",
      "workspace",
      "2026-05-04",
    ]);
  });

  it("reuses the cached read model when only the view changes", async () => {
    const { result, rerender } = renderHook(
      ({ view }) => useScheduleQuery("workspace", "2026-05-04", view),
      {
        initialProps: { view: "week" as const },
        wrapper: wrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ view: "day" });

    expect(result.current.data).toEqual(readModel);
    expect(getScheduleReadModelMock).toHaveBeenCalledTimes(1);
  });
});
