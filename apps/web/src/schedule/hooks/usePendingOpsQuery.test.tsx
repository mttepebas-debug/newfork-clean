import type { SchedulePendingOp } from "@newfork/shared/schedule";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ScheduleDataModule from "../schedule-data";
import { fetchPendingOps, pendingOpsKey } from "../schedule-data";
import { usePendingOpsQuery } from "./usePendingOpsQuery";

vi.mock("../schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof ScheduleDataModule>();
  return {
    ...actual,
    fetchPendingOps: vi.fn().mockResolvedValue({ pending_ops: [] }),
  };
});

const fetchPendingOpsMock = vi.mocked(fetchPendingOps);

function pendingOp(overrides: Partial<SchedulePendingOp>): SchedulePendingOp {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    location_id: "22222222-2222-4222-8222-222222222222",
    week_start: "2026-05-04",
    op_type: "create",
    target_shift_id: null,
    target_draft_id: null,
    payload: {
      location_id: "22222222-2222-4222-8222-222222222222",
      scheduled_date: "2026-05-05",
      start_time: "09:00",
      end_time: "17:00",
    },
    created_by: "33333333-3333-4333-8333-333333333333",
    created_at: "2026-05-04T12:00:00.000Z",
    updated_at: "2026-05-04T12:00:00.000Z",
    ...overrides,
  };
}

function createClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function wrapper(qc = createClient()) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  fetchPendingOpsMock.mockClear();
});

describe("usePendingOpsQuery", () => {
  it("does not fetch outside edit mode", () => {
    renderHook(
      () =>
        usePendingOpsQuery(
          "workspace",
          "2026-05-04",
          "22222222-2222-4222-8222-222222222222",
          "preview",
        ),
      { wrapper: wrapper() },
    );

    expect(fetchPendingOpsMock).not.toHaveBeenCalled();
  });

  it("fetches pending ops in edit mode", async () => {
    const { result } = renderHook(
      () =>
        usePendingOpsQuery(
          "workspace",
          "2026-05-04",
          "22222222-2222-4222-8222-222222222222",
          "edit",
        ),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchPendingOpsMock).toHaveBeenCalledWith("workspace", {
      location_id: "22222222-2222-4222-8222-222222222222",
      week_start: "2026-05-04",
      draft_id: null,
    });
  });

  it("fetches pending ops for multiple edit locations with one request", async () => {
    fetchPendingOpsMock.mockResolvedValueOnce({
      pending_ops: [
        pendingOp({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
        pendingOp({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          location_id: "44444444-4444-4444-8444-444444444444",
        }),
      ],
    });

    const { result } = renderHook(
      () =>
        usePendingOpsQuery(
          "workspace",
          "2026-05-04",
          [
            "22222222-2222-4222-8222-222222222222",
            "44444444-4444-4444-8444-444444444444",
          ],
          "edit",
        ),
      { wrapper: wrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchPendingOpsMock).toHaveBeenCalledTimes(1);
    expect(fetchPendingOpsMock).toHaveBeenCalledWith("workspace", {
      location_ids: [
        "22222222-2222-4222-8222-222222222222",
        "44444444-4444-4444-8444-444444444444",
      ],
      week_start: "2026-05-04",
      draft_id: null,
    });
    expect(result.current.data?.pending_ops).toHaveLength(2);
  });

  it("keeps local draft pending ops when a scoped fetch is stale", async () => {
    const qc = createClient();
    const localOp = pendingOp({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    qc.setQueryData(pendingOpsKey("workspace", "2026-05-04", null, null), {
      pending_ops: [localOp],
    });
    fetchPendingOpsMock.mockResolvedValueOnce({ pending_ops: [] });

    const { result } = renderHook(
      () =>
        usePendingOpsQuery(
          "workspace",
          "2026-05-04",
          [
            "22222222-2222-4222-8222-222222222222",
            "44444444-4444-4444-8444-444444444444",
          ],
          "edit",
        ),
      { wrapper: wrapper(qc) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pending_ops).toEqual([localOp]);
  });

  it("uses the documented query key", () => {
    expect(
      pendingOpsKey(
        "workspace",
        "2026-05-04",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toEqual([
      "schedule-pending-ops",
      "workspace",
      "2026-05-04",
      "22222222-2222-4222-8222-222222222222",
      null,
    ]);
  });
});
