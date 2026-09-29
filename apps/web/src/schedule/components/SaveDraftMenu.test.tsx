import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SaveDraftMenu } from "./SaveDraftMenu";

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

describe("SaveDraftMenu", () => {
  it("closes from Escape while the draft name input is focused", () => {
    render(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const input = screen.getByLabelText("Draft name");
    input.focus();
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
  });

  // BL-310: a second press on Publish closes the menu, it does not reopen it
  // over the typed name.
  it("closes on a second press of its trigger instead of resetting the name", () => {
    render(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Save draft" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText("Draft name"), { target: { value: "Plan B" } });
    fireEvent.click(trigger);

    expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull();
  });

  // BL-181: the page shares this open state with the Published menu; leaving
  // the screen open must not leave that menu open after a save.
  it("reports itself closed when it leaves the screen open", () => {
    const onOpenChange = vi.fn();
    const { unmount } = render(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    unmount();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("opens with draft actions and saves the active draft", async () => {
    const onSave = vi.fn();

    render(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={onSave}
        onSaveAndPublish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const dialog = screen.getByRole("dialog", { name: "Save draft" });
    expect(within(dialog).getByLabelText("Draft name")).toHaveProperty(
      "value",
      "Plan A",
    );

    fireEvent.change(within(dialog).getByLabelText("Draft name"), {
      target: { value: "Plan A revised" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Plan A revised", true, draftA.id),
    );
  });

  it("prefills a versioned Save As name for live working copies", () => {
    render(
      <SaveDraftMenu
        drafts={[{ ...draftA, name: "Published schedule vrs.0.1" }]}
        publishedSchedule={{
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        isWorkingCopy
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const dialog = screen.getByRole("dialog", { name: "Save draft" });

    expect(within(dialog).getByLabelText("Draft name")).toHaveProperty(
      "value",
      "Published schedule vrs.0.2",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save As" }),
    ).toHaveProperty("disabled", false);
  });

  it("keeps save-and-publish ready for a live working copy version name", async () => {
    const onSave = vi.fn();
    const onSaveAndPublish = vi.fn();

    render(
      <SaveDraftMenu
        drafts={[draftA]}
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: draftA.name,
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        isWorkingCopy
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={onSave}
        onSaveAndPublish={onSaveAndPublish}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const dialog = screen.getByRole("dialog", { name: "Save draft" });

    expect(within(dialog).getByLabelText("Draft name")).toHaveProperty(
      "value",
      "Plan A vrs.0.1",
    );
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save and publish" }),
    ).toHaveProperty("disabled", false);

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Save and publish" }));
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onSaveAndPublish).toHaveBeenCalledWith("Plan A vrs.0.1", false, null);
  });

  it("keeps only the publish action on the full-width menu row", () => {
    const { rerender } = render(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      screen
        .getByRole("button", { name: "Save As" })
        .className.includes("schedule-save-menu-publish-action"),
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Save and publish" }),
    ).toBeNull();

    rerender(
      <SaveDraftMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        activeDraftName={draftA.name}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
        onSaveAndPublish={vi.fn()}
      />,
    );

    // Still open from the first press; a second press would close it (BL-310).
    expect(
      screen
        .getByRole("button", { name: "Save and publish" })
        .className.includes("schedule-save-menu-publish-action"),
    ).toBe(true);
  });

  it("reserves the live schedule name while editing a published working copy", () => {
    render(
      <SaveDraftMenu
        drafts={[draftA]}
        publishedSchedule={{
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        isWorkingCopy
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
        onSaveAndPublish={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const dialog = screen.getByRole("dialog", { name: "Save draft" });
    const input = within(dialog).getByLabelText("Draft name");

    fireEvent.change(input, { target: { value: "Published schedule" } });

    expect(
      within(dialog).getByText(/The live schedule name is reserved/),
    ).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      within(dialog).getByRole("button", { name: "Save As" }),
    ).toHaveProperty("disabled", true);
    expect(
      within(dialog).getByRole("button", { name: "Save and publish" }),
    ).toHaveProperty("disabled", true);
  });

  it("shows the published source row separately without an overwrite action", () => {
    render(
      <SaveDraftMenu
        drafts={[
          draftA,
          {
            ...draftA,
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            name: "Plan B",
          },
        ]}
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: draftA.name,
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText(/Published by Mina Yilmaz/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Overwrite Plan A" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Overwrite Plan B" }),
    ).toBeTruthy();
  });

  it("requires confirmation before overwriting an existing draft row", async () => {
    const onSave = vi.fn();

    render(
      <SaveDraftMenu
        drafts={[draftA]}
        trigger={<button type="button">Save draft</button>}
        onSaveDraft={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    const row = screen.getByText("Plan A").closest("[data-save-draft-row]");
    if (!(row instanceof HTMLElement)) throw new Error("draft row missing");

    fireEvent.click(
      within(row).getByRole("button", { name: "Overwrite Plan A" }),
    );
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(
      within(row).getByRole("button", { name: "Confirm overwrite Plan A" }),
    );

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("Plan A", true, draftA.id),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Save draft" })).toBeNull(),
    );
  });
});
