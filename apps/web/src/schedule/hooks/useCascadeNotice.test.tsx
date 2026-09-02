import type * as NewforkUiModule from "@newfork/ui";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CascadeNoticePayload } from "../components/CascadeNoticeToast";
import { isCascadeNoticePayload, useCascadeNotice } from "./useCascadeNotice";

type RealtimeHandler = (payload: { payload: unknown }) => void;
type ChannelOn = (
  type: string,
  config: Record<string, unknown>,
  callback: RealtimeHandler,
) => unknown;
type UnknownMock = (...args: unknown[]) => unknown;

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

const channelState = vi.hoisted(() => ({
  on: vi.fn<ChannelOn>(),
  subscribe: vi.fn<UnknownMock>(),
  removeChannel: vi.fn<UnknownMock>(),
  channel: null as unknown as {
    on: ReturnType<typeof vi.fn<ChannelOn>>;
    subscribe: ReturnType<typeof vi.fn<UnknownMock>>;
  },
  subscription: null as unknown as {
    readonly topic: string;
  },
}));

vi.mock("@newfork/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof NewforkUiModule>();
  return {
    ...actual,
    useToast: vi.fn(() => toastMock),
  };
});

vi.mock("../../lib/supabase", () => ({
  supabaseClient: {
    channel: vi.fn(() => channelState.channel),
    removeChannel: channelState.removeChannel,
  },
}));

const ACTOR_USER_ID = "00000000-0000-0000-0000-0000000000a1";

const notice: CascadeNoticePayload = {
  kind: "cascade_notice",
  actor_user_id: ACTOR_USER_ID,
  deleted_resource: {
    type: "job",
    ids: ["00000000-0000-0000-0000-0000000000b1"],
    name: "Server",
  },
  affected_op_ids: ["00000000-0000-0000-0000-0000000000c1"],
  affected_action: "stripped",
};

function renderCascadeNotice(
  actorNameByUserId?: (userId: string) => string | null | undefined,
): {
  readonly handler: RealtimeHandler;
  readonly unmount: () => void;
} {
  const result = renderHook(() =>
    useCascadeNotice({ workspaceId: "workspace-1", actorNameByUserId }),
  );
  const broadcast = channelState.on.mock.calls.find(
    ([type, config]) =>
      type === "broadcast" && config.event === "cascade_notice",
  );
  if (!broadcast) {
    throw new Error("cascade_notice broadcast handler was not registered");
  }
  return { handler: broadcast[2], unmount: result.unmount };
}

beforeEach(() => {
  toastMock.info.mockReset();
  channelState.on.mockReset();
  channelState.subscribe.mockReset();
  channelState.removeChannel.mockReset();
  channelState.channel = {
    on: channelState.on,
    subscribe: channelState.subscribe,
  };
  channelState.subscription = { topic: "schedule:cascade:workspace-1" };
  channelState.on.mockImplementation(() => ({
    on: channelState.on,
    subscribe: channelState.subscribe,
  }));
  channelState.subscribe.mockImplementation(() => channelState.subscription);
});

describe("isCascadeNoticePayload", () => {
  it("accepts valid cascade notice broadcasts", () => {
    expect(isCascadeNoticePayload(notice)).toBe(true);
  });

  it("rejects unrelated or malformed broadcasts", () => {
    expect(isCascadeNoticePayload(null)).toBe(false);
    expect(isCascadeNoticePayload({ kind: "other" })).toBe(false);
    expect(
      isCascadeNoticePayload({
        kind: "cascade_notice",
        actor_user_id: "00000000-0000-0000-0000-000000000001",
        deleted_resource: { type: "location", ids: [], name: "Patio" },
        affected_op_ids: [],
        affected_action: "mixed",
      }),
    ).toBe(false);
  });
});

describe("useCascadeNotice", () => {
  it("names the actor from the resolver", () => {
    const { handler } = renderCascadeNotice((userId) =>
      userId === ACTOR_USER_ID ? "Mina Yilmaz" : null,
    );

    handler({ payload: notice });

    expect(toastMock.info).toHaveBeenCalledWith(
      '1 pending edit adjusted after Mina Yilmaz changed job "Server".',
    );
  });

  it("falls back to the generic actor label when no resolver match exists", () => {
    const { handler } = renderCascadeNotice();

    handler({ payload: notice });

    expect(toastMock.info).toHaveBeenCalledWith(
      '1 pending edit adjusted after Admin changed job "Server".',
    );
  });

  it("ignores broadcasts that are not cascade notices", () => {
    const { handler } = renderCascadeNotice();

    handler({ payload: { kind: "something_else" } });

    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("subscribes to the workspace cascade channel and removes it on unmount", () => {
    const { unmount } = renderCascadeNotice();

    expect(channelState.on).toHaveBeenCalledWith(
      "broadcast",
      { event: "cascade_notice" },
      expect.any(Function),
    );

    unmount();

    expect(channelState.removeChannel).toHaveBeenCalledWith(
      channelState.subscription,
    );
  });
});
