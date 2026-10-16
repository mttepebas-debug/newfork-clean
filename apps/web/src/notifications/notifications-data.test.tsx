import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import type { NotificationFeed } from "@newfork/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTenantScopedQueryKey } from "../auth/tenant-query-cache";
import { feedPage, notice } from "./notification-fixtures.test-util";

const apiRequest = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  getTabWorkspaceId: () => null,
}));

const {
  getNotificationFeed,
  markNotificationsRead,
  notificationKeys,
  useMarkNotificationsRead,
  useMarkNotificationsSeen,
  useNotificationFeed,
} = await import("./notifications-data");

const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const base = `/v1/workspaces/${w}/notifications`;

beforeEach(() => apiRequest.mockReset());

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, Wrapper };
}

describe("notification calls", () => {
  it("asks for a page with its filter and cursor, and reads the answer through the shared schema", async () => {
    apiRequest.mockResolvedValueOnce(feedPage([notice()]));
    const page = await getNotificationFeed(w, "needs_action", "2026-10-16T16:38:10.2327+00:00");
    expect(page.items[0]?.title).toBe("Time off request from Tom Becker");
    expect(apiRequest.mock.calls[0]?.[1]).toBe(`${base}?filter=needs_action&limit=30&before=2026-10-16T16%3A38%3A10.2327%2B00%3A00`);
  });

  it("refuses an answer that is not the contract", async () => {
    apiRequest.mockResolvedValueOnce({ items: [{ id: "x" }] });
    await expect(getNotificationFeed(w, "all")).rejects.toThrow();
  });

  it("posts the rows to read", async () => {
    apiRequest.mockResolvedValueOnce({ updated: 1, unread_count: 0 });
    await markNotificationsRead(w, { all: true });
    expect(apiRequest.mock.calls[0]?.slice(1)).toEqual([`${base}/read`, { method: "POST", body: '{"all":true}' }]);
  });

  it("keeps the list in the workspace's cache, cleared on a workspace switch", () => {
    expect(isTenantScopedQueryKey(notificationKeys.counts(w))).toBe(true);
    expect(isTenantScopedQueryKey(notificationKeys.feed(w, "all"))).toBe(true);
  });
});

describe("notification hooks", () => {
  it("pages older rows with the cursor the API gave", async () => {
    const { Wrapper } = wrapper();
    apiRequest
      .mockResolvedValueOnce(feedPage([notice()], { has_more: true, next_cursor: "2026-10-16T16:38:10.2327+00:00" }))
      .mockResolvedValueOnce(feedPage([notice({ id: "5beb3f8b-0b54-48ed-ac48-abc004de70de" })]));
    const { result } = renderHook(() => useNotificationFeed(w, "all"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(apiRequest.mock.calls[1]?.[1]).toContain("before=2026-10-16T16%3A38%3A10.2327%2B00%3A00");
    await waitFor(() => expect(result.current.data?.pages.flatMap((page) => page.items)).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("shows a clicked row read at once, then refetches the core's answer", async () => {
    const { client, Wrapper } = wrapper();
    client.setQueryData<InfiniteData<NotificationFeed>>(notificationKeys.feed(w, "all"), {
      pages: [feedPage([notice()])],
      pageParams: [undefined],
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    let release: (value: unknown) => void = () => undefined;
    apiRequest.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const { result } = renderHook(() => useMarkNotificationsRead(w), { wrapper: Wrapper });
    act(() => result.current.mutate({ ids: [notice().id] }));
    await waitFor(() =>
      expect(client.getQueryData<InfiniteData<NotificationFeed>>(notificationKeys.feed(w, "all"))?.pages[0]?.items[0]?.read_at).not.toBeNull(),
    );
    release({ updated: 1, unread_count: 0 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: notificationKeys.all(w) });
  });

  it("clears the badge when the list is opened", async () => {
    const { client, Wrapper } = wrapper();
    client.setQueryData(notificationKeys.counts(w), { unseen_count: 4, unread_count: 5, needs_action_count: 1 });
    apiRequest.mockResolvedValueOnce({ unseen_count: 0 });
    const { result } = renderHook(() => useMarkNotificationsSeen(w), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(apiRequest.mock.calls[0]?.[1]).toBe(`${base}/seen`);
    expect(client.getQueryData(notificationKeys.counts(w))).toEqual({ unseen_count: 0, unread_count: 5, needs_action_count: 1 });
  });
});
