import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ScheduleDataModule from "../schedule-data";
import { draftsKey, listScheduleDrafts } from "../schedule-data";
import { useScheduleDrafts } from "./useScheduleDrafts";

vi.mock("../schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof ScheduleDataModule>();
  return {
    ...actual,
    listScheduleDrafts: vi.fn(),
  };
});

const listScheduleDraftsMock = vi.mocked(listScheduleDrafts);

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  listScheduleDraftsMock.mockReset();
});

describe("useScheduleDrafts", () => {
  it("does not fetch until the workspace is available", () => {
    renderHook(() => useScheduleDrafts(null, "2026-05-04"), {
      wrapper: wrapper(),
    });

    expect(listScheduleDraftsMock).not.toHaveBeenCalled();
  });

  it("does not fetch while explicitly disabled", () => {
    renderHook(
      () => useScheduleDrafts("workspace", "2026-05-04", { enabled: false }),
      {
        wrapper: wrapper(),
      },
    );

    expect(listScheduleDraftsMock).not.toHaveBeenCalled();
  });

  it("fetches week-level drafts once without location scope", async () => {
    listScheduleDraftsMock.mockResolvedValueOnce({
      drafts: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          workspace_id: "workspace",
          week_start: "2026-05-04",
          name: "Draft A",
          revision: 1,
          created_by: "33333333-3333-4333-8333-333333333333",
          updated_by: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-05-05T10:00:00.000Z",
          updated_at: "2026-05-05T10:00:00.000Z",
          updated_by_name: "Olcay Owner",
          shift_count: 0,
          paid_minutes: 0,
          open_shift_count: 0,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          workspace_id: "workspace",
          week_start: "2026-05-04",
          name: "Draft B",
          revision: 2,
          created_by: "33333333-3333-4333-8333-333333333333",
          updated_by: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-05-05T11:00:00.000Z",
          updated_at: "2026-05-05T11:00:00.000Z",
          updated_by_name: "Olcay Owner",
          shift_count: 0,
          paid_minutes: 0,
          open_shift_count: 0,
        },
      ],
      published: { shift_count: 0, paid_minutes: 0, open_shift_count: 0 },
    });

    const { result } = renderHook(
      () => useScheduleDrafts("workspace", "2026-05-04"),
      {
        wrapper: wrapper(),
      },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(listScheduleDraftsMock).toHaveBeenCalledWith(
      "workspace",
      "2026-05-04",
    );
    expect(listScheduleDraftsMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.drafts.map((draft) => draft.name)).toEqual([
      "Draft A",
      "Draft B",
    ]);
  });

  it("uses the documented query key", () => {
    expect(draftsKey("workspace", "2026-05-04")).toEqual([
      "schedule-drafts",
      "workspace",
      "2026-05-04",
    ]);
  });
});
