// BL-303: once the unpublish has succeeded the window is closed, so a failed
// refresh or preview must not throw back into it; it is reported instead.
export async function followUpAfterUnpublish({
  activeDraftId,
  refreshDrafts,
  previewDraft,
  showPublished,
  onError,
}: {
  readonly activeDraftId: string | null;
  readonly refreshDrafts: () => Promise<readonly { readonly id: string }[]>;
  readonly previewDraft: (draftId: string) => Promise<unknown>;
  readonly showPublished: () => void;
  readonly onError: (error: unknown) => void;
}): Promise<void> {
  try {
    const drafts = await refreshDrafts();
    const draftId =
      (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)
        ? activeDraftId
        : drafts[0]?.id) ?? null;
    if (draftId) await previewDraft(draftId);
    else showPublished();
  } catch (error) {
    onError(error);
  }
}
