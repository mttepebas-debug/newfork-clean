import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EnterEditModeDialog } from "./EnterEditModeDialog";

const draftA = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  name: "Plan A",
  revision: 2,
  created_by: "22222222-2222-4222-8222-222222222222",
  updated_by: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-08-17T12:00:00Z",
  updated_at: "2026-08-17T12:30:00Z",
};

describe("EnterEditModeDialog", () => {
  it("lets draft rows expose delete without loading that draft", () => {
    const onLoadDraft = vi.fn();
    const onDeleteDraft = vi.fn();

    render(
      <EnterEditModeDialog
        open
        drafts={[draftA]}
        onOpenChange={vi.fn()}
        onStartBlank={vi.fn()}
        onLoadDraft={onLoadDraft}
        onDeleteDraft={onDeleteDraft}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Plan A" }));

    expect(onDeleteDraft).toHaveBeenCalledWith(draftA);
    expect(onLoadDraft).not.toHaveBeenCalled();
  });

  it("renders blank-start and empty draft state", () => {
    const onStartBlank = vi.fn();

    render(
      <EnterEditModeDialog
        open
        drafts={[]}
        onOpenChange={vi.fn()}
        onStartBlank={onStartBlank}
        onLoadDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Start blank"));

    expect(onStartBlank).toHaveBeenCalledTimes(1);
    expect(screen.getByText("No saved drafts for this week.")).toBeTruthy();
  });
});
