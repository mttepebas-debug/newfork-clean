import { describe, expect, it, vi } from "vitest";

import { followUpAfterUnpublish } from "./scheduleUnpublishFollowUp";

const draftA = { id: "draft-a" };
const draftB = { id: "draft-b" };

describe("followUpAfterUnpublish (BL-303)", () => {
  it("keeps previewing the active draft when it is still there", async () => {
    const previewDraft = vi.fn().mockResolvedValue(undefined);
    const showPublished = vi.fn();
    await followUpAfterUnpublish({
      activeDraftId: "draft-b",
      refreshDrafts: () => Promise.resolve([draftA, draftB]),
      previewDraft,
      showPublished,
      onError: vi.fn(),
    });

    expect(previewDraft).toHaveBeenCalledWith("draft-b");
    expect(showPublished).not.toHaveBeenCalled();
  });

  it("falls back to the first draft, then to the schedule with no draft", async () => {
    const previewDraft = vi.fn().mockResolvedValue(undefined);
    const showPublished = vi.fn();
    await followUpAfterUnpublish({
      activeDraftId: "draft-gone",
      refreshDrafts: () => Promise.resolve([draftA]),
      previewDraft,
      showPublished,
      onError: vi.fn(),
    });
    expect(previewDraft).toHaveBeenCalledWith("draft-a");

    await followUpAfterUnpublish({
      activeDraftId: null,
      refreshDrafts: () => Promise.resolve([]),
      previewDraft,
      showPublished,
      onError: vi.fn(),
    });
    expect(showPublished).toHaveBeenCalledTimes(1);
  });

  it("reports a failed refresh instead of throwing into the closed window", async () => {
    const failure = new Error("Network down");
    const onError = vi.fn();
    const previewDraft = vi.fn();

    await expect(
      followUpAfterUnpublish({
        activeDraftId: "draft-a",
        refreshDrafts: () => Promise.reject(failure),
        previewDraft,
        showPublished: vi.fn(),
        onError,
      }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(failure);
    expect(previewDraft).not.toHaveBeenCalled();
  });

  it("reports a failed preview the same way", async () => {
    const failure = new Error("Preview failed");
    const onError = vi.fn();

    await followUpAfterUnpublish({
      activeDraftId: "draft-a",
      refreshDrafts: () => Promise.resolve([draftA]),
      previewDraft: () => Promise.reject(failure),
      showPublished: vi.fn(),
      onError,
    });

    expect(onError).toHaveBeenCalledWith(failure);
  });
});
