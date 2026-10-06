import type { ScheduleEditSession } from "@newfork/shared/schedule";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acquireScheduleEditSession,
  autosaveScheduleEditSession,
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
  autosaveScheduleEditSession: vi.fn(),
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
  new ScheduleRequestError("edit lease expired", 409, { error: "edit lease expired", code: "edit_lease_expired" });

function renderEditSession() {
  const onError = vi.fn();
  const onEnded = vi.fn();
  const onAutoSaved = vi.fn();
  const onRecovered = vi.fn();
  const hook = renderHook(() =>
    useScheduleEditSession({ userId: session.holder_user_id, workspaceId: WORKSPACE_ID, onError, onEnded, onAutoSaved, onRecovered }),
  );
  return { ...hook, onError, onEnded, onAutoSaved, onRecovered };
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
  vi.mocked(autosaveScheduleEditSession).mockReset().mockResolvedValue({
    status: "saved", draft_id: "55555555-5555-4555-8555-555555555555", draft_name: "Auto-save · Ayse Yilmaz · Aug 17, 12:15 PM",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useScheduleEditSession", () => {
  it("keeps the lock alive while the Keep editing? countdown is open (D-Y3)", async () => {
    const hook = renderEditSession();
    await startEditing(hook);

    // No activity: the warning opens at 15 min and counts down 15 s (S1).
    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 10_000));

    expect(vi.mocked(heartbeatScheduleEditSession).mock.calls.length).toBe(15);
    expect(hook.result.current.idleSeconds).not.toBeNull();
    expect(hook.onEnded).not.toHaveBeenCalled();
  });

  it("still ends the edit at the idle timeout although every heartbeat answers", async () => {
    const hook = renderEditSession();
    await startEditing(hook);

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 15_000));

    expect(hook.onEnded).toHaveBeenCalledTimes(1);
    expect(hook.result.current.session).toBeNull();
  });

  // S1 (KARARLAR "Hareketsizlik"): the work is kept, never thrown away.
  it("keeps the work as an Auto-save draft when the countdown ends, and says so", async () => {
    const hook = renderEditSession();
    await startEditing(hook);

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 15_000));

    expect(autosaveScheduleEditSession).toHaveBeenCalledWith(WORKSPACE_ID, session.id);
    expect(discardScheduleEditSession).not.toHaveBeenCalled();
    expect(hook.onAutoSaved).toHaveBeenCalledWith("Auto-save · Ayse Yilmaz · Aug 17, 12:15 PM");
  });

  // D-O9 (KK-162): a lapsed edit put aside on opening is named, once.
  it("names the draft an earlier edit was saved as when opening sets it aside", async () => {
    const hook = renderEditSession();
    vi.mocked(acquireScheduleEditSession).mockResolvedValueOnce({
      status: "acquired_after_recovery",
      session,
      recovered_draft_id: "55555555-5555-4555-8555-555555555555",
      recovered_draft_name: "Auto-save · Ayse Yilmaz · Oct 5, 9:14 PM",
    });

    await act(() => hook.result.current.acquire(session.week_start, "draft", session.source_draft_id, null));

    expect(hook.onRecovered).toHaveBeenCalledWith("Auto-save · Ayse Yilmaz · Oct 5, 9:14 PM");
  });

  it("says nothing when opening sets nothing aside", async () => {
    const hook = renderEditSession();
    await startEditing(hook);
    expect(hook.onRecovered).not.toHaveBeenCalled();
  });

  it("closes an edit with nothing to keep quietly", async () => {
    vi.mocked(autosaveScheduleEditSession).mockResolvedValueOnce({ status: "nothing_to_save", draft_id: null, draft_name: null });
    const hook = renderEditSession();
    await startEditing(hook);

    await act(() => vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 15_000));

    expect(hook.onEnded).toHaveBeenCalledTimes(1);
    expect(hook.onAutoSaved).not.toHaveBeenCalled();
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
