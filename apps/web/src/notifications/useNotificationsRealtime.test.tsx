import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type Handler = (event: { payload?: unknown }) => void;
const channels: { name: string; config: unknown; handler?: Handler }[] = [];
const removeChannel = vi.fn();
vi.mock("../lib/supabase", () => ({
  supabaseClient: {
    channel: (name: string, config: unknown) => {
      const entry: (typeof channels)[number] = { name, config };
      channels.push(entry);
      const channel = {
        on: (_type: string, _filter: unknown, handler: Handler) => {
          entry.handler = handler;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: (...args: unknown[]) => removeChannel(...args),
  },
}));

const { useNotificationsRealtime } = await import("./useNotificationsRealtime");

const w = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const user = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

function mount(userId: string | undefined) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const Wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useNotificationsRealtime(userId, w), { wrapper: Wrapper });
  return { invalidate, hook };
}

describe("useNotificationsRealtime", () => {
  it("listens on the person's own private channel and refreshes this workspace's list", () => {
    channels.length = 0;
    const { invalidate, hook } = mount(user);
    expect(channels).toEqual([expect.objectContaining({ name: `notifications:${user}`, config: { config: { private: true } } })]);
    channels[0]!.handler!({ payload: { workspace_id: w } });
    channels[0]!.handler!({ payload: { workspace_id: null } });
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications", w] });
    hook.unmount();
    expect(removeChannel).toHaveBeenCalled();
  });

  it("leaves another workspace's signal alone", () => {
    channels.length = 0;
    const { invalidate } = mount(user);
    channels[0]!.handler!({ payload: { workspace_id: "16fe2550-8960-480c-9874-cbc76a8e56a9" } });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("opens no channel without a person", () => {
    channels.length = 0;
    mount(undefined);
    expect(channels).toHaveLength(0);
  });
});
