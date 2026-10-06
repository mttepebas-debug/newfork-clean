import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useScheduleViewerPresence } from "./useScheduleViewerPresence";

type Sync = () => void;

const mocks = vi.hoisted(() => {
  const channels: {
    name: string;
    sync: Sync | null;
    state: Record<string, unknown[]>;
  }[] = [];
  const removeChannel = vi.fn();
  const channel = vi.fn((name: string) => {
    const entry = { name, sync: null as Sync | null, state: {} as Record<string, unknown[]> };
    channels.push(entry);
    const api = {
      on: (_type: string, _filter: unknown, handler: Sync) => {
        entry.sync = handler;
        return api;
      },
      subscribe: () => api,
      track: vi.fn(),
      untrack: vi.fn(),
      presenceState: () => entry.state,
    };
    return api;
  });
  return { channels, channel, removeChannel };
});

vi.mock("../../lib/supabase", () => ({
  supabaseClient: { channel: mocks.channel, removeChannel: mocks.removeChannel },
}));

beforeEach(() => {
  mocks.channels.length = 0;
  mocks.channel.mockClear();
  mocks.removeChannel.mockClear();
});

// D-D3: with "All locations" shown, someone editing Besiktas is seen too.
describe("useScheduleViewerPresence across shown locations", () => {
  it("joins every shown location and counts each person once, editing first", () => {
    const { result } = renderHook(() =>
      useScheduleViewerPresence({
        workspaceId: "workspace",
        weekStart: "2026-05-04",
        locationIds: ["kadikoy", "besiktas"],
        authUserId: "ayse",
        mode: "preview",
      }),
    );

    expect(mocks.channel.mock.calls.map(([name]) => name)).toEqual([
      "schedule:presence:workspace:kadikoy:2026-05-04",
      "schedule:presence:workspace:besiktas:2026-05-04",
    ]);

    const [kadikoy, besiktas] = mocks.channels;
    kadikoy!.state = { zeynep: [{ user_id: "zeynep", mode: "preview", online_at: "2026-05-04T09:00:00Z" }] };
    besiktas!.state = {
      zeynep: [{ user_id: "zeynep", mode: "edit", online_at: "2026-05-04T09:00:00Z" }],
      mehmet: [{ user_id: "mehmet", mode: "preview", online_at: "2026-05-04T09:01:00Z" }],
    };
    act(() => {
      kadikoy!.sync?.();
      besiktas!.sync?.();
    });

    expect(result.current.map((viewer) => [viewer.userId, viewer.mode])).toEqual([
      ["zeynep", "edit"],
      ["mehmet", "preview"],
    ]);
  });
});
