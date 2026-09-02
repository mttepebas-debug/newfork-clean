import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { supabaseClient } from "../../lib/supabase";
import { useScheduleRealtime } from "./useScheduleRealtime";

type BroadcastHandler = (event: { payload: unknown }) => void;

const mocks = vi.hoisted(() => {
  let broadcastHandler: BroadcastHandler | null = null;
  const removeChannelMock = vi.fn();
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => {
      broadcastHandler = handler;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  const channelMock = vi.fn(() => channel);
  return {
    channel,
    channelMock,
    get broadcastHandler() {
      return broadcastHandler;
    },
    resetBroadcastHandler() {
      broadcastHandler = null;
    },
    removeChannelMock,
  };
});

vi.mock("../../lib/supabase", () => ({
  supabaseClient: {
    channel: mocks.channelMock,
    removeChannel: mocks.removeChannelMock,
  },
}));

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function renderRealtimeHook(queryClient = new QueryClient()) {
  return renderHook(
    () =>
      useScheduleRealtime({
        workspaceId: "workspace",
        weekStart: "2026-05-04",
        selectedDate: "2026-05-05",
        view: "week",
        locationIds: ["loc-1", "loc-2"],
        activeDraftId: "draft-1",
      }),
    { wrapper: wrapper(queryClient) },
  );
}

beforeEach(() => {
  mocks.resetBroadcastHandler();
  mocks.channel.on.mockClear();
  mocks.channel.subscribe.mockClear();
  mocks.channelMock.mockClear();
  mocks.removeChannelMock.mockClear();
});

describe("useScheduleRealtime", () => {
  it("subscribes to schedule invalidation broadcasts for the workspace", () => {
    const { unmount } = renderRealtimeHook();

    expect(supabaseClient?.channel).toHaveBeenCalledWith(
      "schedule:invalidation:workspace",
    );
    expect(mocks.channel.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "schedule_invalidation" },
      expect.any(Function),
    );
    expect(mocks.channel.subscribe).toHaveBeenCalled();

    unmount();

    expect(mocks.removeChannelMock).toHaveBeenCalledWith(mocks.channel);
  });

  it("invalidates matching schedule, pending op, draft, and lineup caches", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderRealtimeHook(queryClient);

    mocks.broadcastHandler?.({
      payload: {
        kind: "schedule_invalidation",
        workspace_id: "workspace",
        week_start: "2026-05-04",
        location_ids: ["loc-2"],
        draft_id: "draft-1",
        targets: [
          "published_shifts",
          "draft_shifts",
          "pending_ops",
          "drafts",
          "lineups",
        ],
      },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["schedule-read", "workspace", "2026-05-05", "week"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["schedule-pending-ops", "workspace", "2026-05-04"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["schedule-drafts", "workspace", "2026-05-04"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["lineup"] });
  });

  it("ignores invalidations for a different workspace, week, or location", () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    renderRealtimeHook(queryClient);

    for (const payload of [
      {
        kind: "schedule_invalidation",
        workspace_id: "other",
        week_start: "2026-05-04",
        location_ids: ["loc-1"],
        targets: ["published_shifts"],
      },
      {
        kind: "schedule_invalidation",
        workspace_id: "workspace",
        week_start: "2026-05-11",
        location_ids: ["loc-1"],
        targets: ["published_shifts"],
      },
      {
        kind: "schedule_invalidation",
        workspace_id: "workspace",
        week_start: "2026-05-04",
        location_ids: ["loc-3"],
        targets: ["published_shifts"],
      },
    ]) {
      mocks.broadcastHandler?.({ payload });
    }

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
