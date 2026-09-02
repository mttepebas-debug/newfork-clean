import type { ScheduleDraftSummary } from "@newfork/shared/schedule";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SaveDraftDialog } from "./SaveDraftDialog";

const draft: ScheduleDraftSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  week_start: "2026-08-17",
  name: "Service week",
  revision: 3,
  created_by: "33333333-3333-4333-8333-333333333333",
  updated_by: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-08-17T12:00:00Z",
  updated_at: "2026-08-17T12:00:00Z",
};

describe("SaveDraftDialog", () => {
  it("submits a new draft name", () => {
    const onSave = vi.fn();

    render(
      <SaveDraftDialog
        drafts={[draft]}
        initialDraft={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Draft name"), {
      target: { value: "Weekend schedule" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(onSave).toHaveBeenCalledWith("Weekend schedule", null);
  });

  it("submits the selected overwrite draft and updates the name field", () => {
    const onSave = vi.fn();

    render(
      <SaveDraftDialog
        drafts={[draft]}
        initialDraft={null}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByLabelText("Destination"), {
      target: { value: draft.id },
    });

    expect(screen.getByLabelText("Draft name")).toHaveProperty(
      "value",
      "Service week",
    );
    expect(
      screen.getByText(
        "This replaces revision 3 of “Service week”. Published shifts are unchanged.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Overwrite draft" }));

    expect(onSave).toHaveBeenCalledWith("Service week", draft);
  });
});
