import type { ScheduleEditSession } from "@newfork/shared/schedule";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireScheduleEditSession,
  discardScheduleEditSession,
  heartbeatScheduleEditSession,
  ScheduleRequestError,
} from "../schedule-data";
import { useScheduleEditSession } from "./useScheduleEditSession";

vi.mock("../schedule-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../schedule-data")>()),
  acquireScheduleEditSession: vi.fn(),
  heartbeatScheduleEditSession: vi.fn(),
  discardScheduleEditSession: vi.fn().mockResolvedValue(undefined),
}));

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const session: ScheduleEditSession = {
  id: "77777777-7777-4777-8777-777777777777",
  workspace_id: WORKSPACE_ID,
  week_start: "2026-08-17",
  source_kind: "draft",
  source_draft_id: "33333333-3333-4333-8333-333333333333",
  source_revision: 1,
  holder_user_id: "88888888-8888-4888-8888-888888888888",
  holder_name: "Ayse Yilmaz",
  revision: 4,
  dirty: true,
  last_heartbeat: "2026-08-17T12:00:00Z",
  expires_at: "2026-08-17T12:04:00Z",
  location_ids: ["22222222-2222-4222-8222-222222222222"],
  shifts: [],
};
const leaseExpired = () =>
  new ScheduleRequestError("edit lease expired", 409, { error: "edit lease expired" });

function renderEditSession() {
  const onError = vi.fn();
  const onEnded = vi.fn();
  const hook = renderHook(() =>
    useScheduleEditSession({ userId: session.holder_user_id, workspaceId: WORKSPACE_ID, onError, onEnded }),
  );
  return { ...hook, onError, onEnded };
}

async function startEditing(hook: ReturnType<typeof renderEditSession>) {
  vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({ status: "acquired", session });
  await act(() => hook.result.current.acquire(session.week_start, "draft", session.source_draft_id, null));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(acquireScheduleEditSession).mockReset();
  // Every heartbeat answers with a fresh copy, as the API does.
  vi.mocked(heartbeatScheduleEditSession).mockReset().mockImplementation(() => Promise.resolve({ ...session }));
  vi.mocked(discardScheduleEditSession).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useScheduleEditSession", () => {
  it("keeps the lock alive while the Keep editing? countdown is open (D-Y3)", async () => {
    const hook = renderEditSession();
    await startEditing(hook);

    // No activity: the warning opens at 15 min and the edit ends at 20 min.
    await act(() => vi.advanceTimersByTimeAsync(19 * 60 * 1000));

    expect(vi.mocked(heartbeatScheduleEditSession).mock.calls.length).toBe(19);
    expect(hook.result.current.idleSeconds).not.toBeNull();
    expect(hook.onEnded).not.toHaveBeenCalled();
  });

  it("still ends the edit at the idle timeout although every heartbeat answers", async () => {
    const hook = renderEditSession();
    await startEditing(hook);

    await act(() => vi.advanceTimersByTimeAsync(20 * 60 * 1000));

    expect(hook.onEnded).toHaveBeenCalledTimes(1);
    expect(hook.result.current.session).toBeNull();
  });

  it("does not pass off a fresh edit as the lapsed one; it releases it and ends the edit", async () => {
    const hook = renderEditSession();
    await startEditing(hook);
    const fresh = { ...session, id: "66666666-6666-4666-8666-666666666666", dirty: false };
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({ status: "acquired", session: fresh });

    let recovered: ScheduleEditSession | null = session;
    await act(async () => { recovered = await hook.result.current.recoverLease(); });

    expect(recovered).toBeNull();
    expect(hook.result.current.session).toBeNull();
    expect(discardScheduleEditSession).toHaveBeenCalledWith(WORKSPACE_ID, fresh.id);
    expect(hook.onEnded).toHaveBeenCalledTimes(1);
    expect(hook.onError).toHaveBeenCalledWith(expect.not.stringMatching(/lease/i));
  });

  it("picks the same edit back up when its lock lapsed, without a raw error (D-Y3)", async () => {
    const hook = renderEditSession();
    await startEditing(hook);
    const resumed = { ...session, expires_at: "2026-08-17T12:09:00Z" };
    vi.mocked(heartbeatScheduleEditSession).mockRejectedValueOnce(leaseExpired());
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({ status: "resumed", session: resumed });

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(acquireScheduleEditSession).toHaveBeenLastCalledWith(
      WORKSPACE_ID, session.week_start, "draft", session.source_draft_id, session.location_ids,
    );
    expect(hook.result.current.session).toEqual(resumed);
    expect(hook.onError).not.toHaveBeenCalled();
  });

  it("recoverLease resumes the open edit and hands back the live session", async () => {
    const hook = renderEditSession();
    await startEditing(hook);
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({ status: "resumed", session: { ...session } });

    let recovered: ScheduleEditSession | null = null;
    await act(async () => { recovered = await hook.result.current.recoverLease(); });

    expect(recovered).toEqual(session);
  });
});
