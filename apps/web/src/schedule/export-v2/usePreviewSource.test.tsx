import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScheduleDraftSummary, ScheduleReadModel, ScheduleShift } from "@newfork/shared/schedule";
import { fetchScheduleDraftShifts } from "../schedule-data";
import { usePreviewSource } from "./usePreviewSource";

vi.mock("../schedule-data", () => ({ fetchScheduleDraftShifts: vi.fn() }));
const model = { workspace_id: "w", week_start: "2026-09-14", locations: [{ id: "l" }] } as ScheduleReadModel;
const drafts = ["a", "b"].map(id => ({ id, name: id, revision: 1, workspace_id: "w", week_start: model.week_start })) as ScheduleDraftSummary[];
const shifts = (id: string) => [{ id }] as ScheduleShift[];
const base = { workspaceId: "w", model, modelVersion: 1, activeDraftId: "a" as string | null,
  editing: false, loading: false, drafts, onMissingDraft: vi.fn() };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe("live preview source resolution", () => {
  it("ignores a late A response after preview B becomes active", async () => {
    const a = deferred<{ shifts: ScheduleShift[] }>(), b = deferred<{ shifts: ScheduleShift[] }>();
    vi.mocked(fetchScheduleDraftShifts).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const { result, rerender } = renderHook(props => usePreviewSource(props), { initialProps: base });
    expect(result.current.resolvedKey).toBeNull();
    rerender({ ...base, activeDraftId: "b" });
    await act(async () => b.resolve({ shifts: shifts("b-shift") }));
    expect(result.current.source).toMatchObject({ id: "b" }); expect(result.current.shifts?.[0]?.id).toBe("b-shift");
    await act(async () => a.resolve({ shifts: shifts("a-shift") }));
    expect(result.current.shifts?.[0]?.id).toBe("b-shift");
    expect(result.current.requestedKey).toBe(result.current.resolvedKey);
  });
  it("invalidates the old snapshot during loading, edit entry and workspace changes", async () => {
    vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({ shifts: shifts("a") });
    const { result, rerender } = renderHook(props => usePreviewSource(props), { initialProps: base });
    await waitFor(() => expect(result.current.loading).toBe(false));
    rerender({ ...base, loading: true }); expect(result.current.resolvedKey).toBeNull();
    rerender({ ...base, editing: true }); expect(result.current.resolvedKey).toBeNull();
    rerender({ ...base, workspaceId: "other", activeDraftId: null }); expect(result.current.resolvedKey).toBeNull();
  });
  it("switches immediately to published without letting a pending draft restore itself", async () => {
    const a = deferred<{ shifts: ScheduleShift[] }>(); vi.mocked(fetchScheduleDraftShifts).mockReturnValue(a.promise);
    const { result, rerender } = renderHook(props => usePreviewSource(props), { initialProps: base });
    rerender({ ...base, activeDraftId: null });
    expect(result.current.loading).toBe(false); expect(result.current.source?.kind).toBe("published");
    await act(async () => a.resolve({ shifts: shifts("a") }));
    expect(result.current.source?.kind).toBe("published"); expect(result.current.shifts).toBeNull();
  });
  it("does not authorize a failed draft read or a changed model revision", async () => {
    vi.mocked(fetchScheduleDraftShifts).mockRejectedValue(new Error("No access"));
    const { result, rerender } = renderHook(props => usePreviewSource(props), { initialProps: base });
    await waitFor(() => expect(result.current.error).toBe("No access")); expect(result.current.resolvedKey).toBeNull();
    const pending = deferred<{ shifts: ScheduleShift[] }>(); vi.mocked(fetchScheduleDraftShifts).mockReturnValue(pending.promise);
    rerender({ ...base, modelVersion: 2 }); expect(result.current.resolvedKey).toBeNull(); expect(result.current.error).toBeNull();
  });
  it("invalidates a renamed draft even when its shift revision is unchanged", async () => {
    vi.mocked(fetchScheduleDraftShifts).mockResolvedValue({ shifts: shifts("a") });
    const { result, rerender } = renderHook(props => usePreviewSource(props), { initialProps: base });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const previousKey = result.current.resolvedKey;
    rerender({ ...base, drafts: drafts.map(draft => ({ ...draft, name: "Renamed draft" })) });
    expect(result.current.requestedKey).not.toBe(previousKey);
    expect(result.current.resolvedKey).toBeNull();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toMatchObject({ name: "Renamed draft" });
  });
  it("reads the draft again on retry after a failed read (BL-324)", async () => {
    vi.mocked(fetchScheduleDraftShifts)
      .mockRejectedValueOnce(new Error("Server error"))
      .mockResolvedValueOnce({ shifts: shifts("a-again") });
    const { result } = renderHook(props => usePreviewSource(props), { initialProps: base });
    await waitFor(() => expect(result.current.error).toBe("Server error"));
    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.shifts?.[0]?.id).toBe("a-again"));
  });
});
