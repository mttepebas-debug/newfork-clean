import type { ActiveWorkspaceContext } from "@newfork/shared";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExchangeRealtime } from "./useExchangeRealtime";

const realtime = vi.hoisted(() => {
  const channels: Array<{
    name: string;
    broadcast?: (message: { payload: unknown }) => void;
    status?: (status: string) => void;
    on: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  }> = [];
  return {
    channels,
    channel: vi.fn((name: string) => {
      const channel = {
        name,
        broadcast: undefined as
          ((message: { payload: unknown }) => void) | undefined,
        status: undefined as ((status: string) => void) | undefined,
        on: vi.fn(),
        subscribe: vi.fn(),
      };
      channel.on.mockImplementation((_type, _filter, handler) => {
        channel.broadcast = handler;
        return channel;
      });
      channel.subscribe.mockImplementation((handler) => {
        channel.status = handler;
        return channel;
      });
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(),
  };
});
vi.mock("../../lib/supabase", () => ({ supabaseClient: realtime }));

// Only what the gate reads: the workspace and the core's answer (`actions`).
function context(workspace: string, actions = ["exchange.offer_own"]) {
  return { workspace: { id: workspace }, actions } as unknown as ActiveWorkspaceContext;
}

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const keys = [
    ["schedule-read", "workspace", "2030-01-07", "week"],
    ["schedule-read", "workspace", "2030-01-14", "week"],
    ["employee-hub", "workspace", "schedule"],
    ["notifications", "workspace", "sidebar"],
    ["schedule-read", "another-workspace", "2030-01-07", "week"],
    ["unrelated-form", "workspace"],
  ];
  for (const key of keys) client.setQueryData(key, { saved: true });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ workspace, actions }: { workspace: string; actions?: string[] }) =>
      useExchangeRealtime(context(workspace, actions)),
    { initialProps: { workspace: "workspace" } as { workspace: string; actions?: string[] }, wrapper },
  );
  return { ...hook, client, keys };
}

beforeEach(() => {
  vi.useFakeTimers();
  realtime.channels.length = 0;
  vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function tick(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
function changed() {
  act(() => realtime.channels[0]?.broadcast?.({ payload: { workspace_id: "workspace" } }));
}

describe("joining only a channel the person may join", () => {
  it("does not open the Shift Hub channel for someone the core refuses (BL-115)", () => {
    const { rerender, unmount } = setup();
    expect(realtime.channels.map((channel) => channel.name)).toEqual(["shift-exchanges:workspace"]);
    // A missing required document or unfinished activation takes exchange.offer_own away.
    rerender({ workspace: "workspace", actions: [] });
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channels[0]);
    expect(realtime.channels).toHaveLength(1);
    unmount();
  });

  // BL-152: the refused channel must not take the 60 s fallback with it.
  it("keeps the 60 second fallback for someone the core refuses the channel", async () => {
    const { client, rerender, unmount } = setup();
    rerender({ workspace: "workspace", actions: [] });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => vi.advanceTimersByTime(60_000));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    expect(realtime.channels).toHaveLength(1);
    unmount();
  });
});

describe("workspace staffing and exchange invalidation", () => {
  it("combines domain, inbox and recovery signals without postponing the first refresh", async () => {
    const { client, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    changed();
    await tick(220);
    changed();
    act(() => {
      realtime.channels[0]?.status?.("SUBSCRIBED");
      window.dispatchEvent(new Event("online"));
    });
    await tick(29);
    expect(invalidate).not.toHaveBeenCalled();
    await tick(1);
    const firstBatch = invalidate.mock.calls.length;
    expect(firstBatch).toBeGreaterThan(0);
    await tick(250);
    expect(invalidate).toHaveBeenCalledTimes(firstBatch);
    unmount();
  });

  it("finishes an in-flight read and then reads a later commit once, without overlapping requests", async () => {
    const { client, unmount } = setup();
    const key = ["shift-exchanges", "workspace", "employee"];
    let owner = "Alex";
    let active = 0;
    let maximumActive = 0;
    const completions: Array<() => void> = [];
    const reads: string[] = [];
    client.setQueryData(key, { owner });
    const observer = new QueryObserver(client, {
      queryKey: key, staleTime: Infinity,
      queryFn: () => {
        const snapshot = owner;
        reads.push(snapshot);
        maximumActive = Math.max(maximumActive, ++active);
        return new Promise<{ owner: string }>((resolve) => {
          completions.push(() => { active--; resolve({ owner: snapshot }); });
        });
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    changed();
    await tick(250);
    expect(reads).toEqual(["Alex"]);
    owner = "Blake";
    changed(); changed(); changed();
    await tick(1000);
    expect(reads).toEqual(["Alex"]);
    await act(async () => { completions[0]!(); });
    await tick(250);
    expect(reads).toEqual(["Alex", "Blake"]);
    await act(async () => { completions[1]!(); });
    await tick(1000);
    expect(client.getQueryData(key)).toEqual({ owner: "Blake" });
    expect(reads).toHaveLength(2);
    expect(maximumActive).toBe(1);
    unsubscribe(); unmount(); client.clear();
  });

  it("does not lose recovery when a scheduled refresh becomes hidden", async () => {
    const { client, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    changed();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await tick(250);
    expect(invalidate).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    unmount();
  });

  it("discards a queued refresh when the workspace changes", async () => {
    const { client, rerender, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    changed();
    rerender({ workspace: "next-workspace" });
    await tick(250);
    expect(invalidate).not.toHaveBeenCalled();
    act(() => realtime.channels[1]?.broadcast?.({ payload: { workspace_id: "workspace" } }));
    await tick(250);
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it("does not schedule a remembered follow-up after unmount", async () => {
    const { client, unmount } = setup();
    let complete!: () => void;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(pending);
    changed();
    await tick(250);
    changed();
    const calls = invalidate.mock.calls.length;
    unmount();
    await act(async () => { complete(); });
    await tick(60_000);
    expect(invalidate).toHaveBeenCalledTimes(calls);
  });

  it("allows a new refresh after a rejected batch", async () => {
    const { client, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("Read failed"));
    changed();
    await tick(250);
    const failedCalls = invalidate.mock.calls.length;
    invalidate.mockResolvedValue();
    changed();
    await tick(250);
    expect(invalidate).toHaveBeenCalledTimes(failedCalls * 2);
    unmount();
  });

  it("invalidates both cached weeks, the hub and inbox without replacing their data", async () => {
    const { client, keys, unmount } = setup();
    act(() =>
      realtime.channels[0]?.broadcast?.({
        payload: { workspace_id: "workspace" },
      }),
    );
    await tick(250);
    for (const key of keys.slice(0, 4)) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(client.getQueryData(key)).toEqual({ saved: true });
    }
    for (const key of keys.slice(4))
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    unmount();
  });

  it("ignores foreign or malformed messages", () => {
    const { client, keys, unmount } = setup();
    for (const payload of [null, {}, { workspace_id: "another-workspace" }]) {
      act(() => realtime.channels[0]?.broadcast?.({ payload }));
    }
    expect(client.getQueryState(keys[0]!)?.isInvalidated).toBe(false);
    unmount();
  });

  it("refreshes on subscription recovery, browser online and returning to a visible tab", async () => {
    const { client, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => realtime.channels[0]?.status?.("SUBSCRIBED"));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();
    act(() => window.dispatchEvent(new Event("online")));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    unmount();
  });

  it("retains the 60 second fallback and avoids network reads while hidden or offline", async () => {
    const { client, unmount } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => vi.advanceTimersByTime(59_999));
    expect(invalidate).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    await tick(250);
    expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => vi.advanceTimersByTime(60_000));
    expect(invalidate).not.toHaveBeenCalled();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() =>
      realtime.channels[0]?.broadcast?.({
        payload: { workspace_id: "workspace" },
      }),
    );
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });

  it("removes the prior workspace subscription, listeners and fallback on cleanup", () => {
    const { client, rerender, unmount } = setup();
    rerender({ workspace: "next-workspace" });
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channels[0]);
    expect(realtime.channels[1]?.name).toBe("shift-exchanges:next-workspace");
    unmount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(realtime.removeChannel).toHaveBeenCalledWith(realtime.channels[1]);
  });
});
