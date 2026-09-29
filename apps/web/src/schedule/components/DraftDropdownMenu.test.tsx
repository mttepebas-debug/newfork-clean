import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DraftDropdownMenu } from "./DraftDropdownMenu";

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

const publishedLocation = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Main Room",
  color: "#176954",
  timezone: "America/Los_Angeles",
  status: "published" as const,
  reason: "active_publication_and_shifts" as const,
  publication_includes_location: true,
  published_shift_count: 4,
  draft_shift_count: 4,
  published_at: "2026-08-17T12:45:00Z",
  published_by_name: "Mina Yilmaz",
  source_draft_id: null,
  source_draft_name: null,
};

const template = {
  id: "44444444-4444-4444-8444-444444444444",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  name: "Dinner rush",
  revision: 1,
  shift_count: 6,
  open_slot_count: 2,
  created_by_name: "Mina Yilmaz",
  created_at: "2026-08-17T12:00:00Z",
  updated_at: "2026-08-17T12:30:00Z",
};

describe("DraftDropdownMenu", () => {
  it("opens saved drafts and routes blank, published, preview, and edit actions", async () => {
    const onOpen = vi.fn();
    const onStartBlankDraft = vi.fn();
    const onEditPublishedSchedule = vi.fn();
    const onPreviewDraft = vi.fn();
    const onEditDraft = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        canEditPublishedSchedule
        publishedSchedule={{
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        onOpen={onOpen}
        onPreviewDraft={onPreviewDraft}
        onEditDraft={onEditDraft}
        onStartBlankDraft={onStartBlankDraft}
        onEditPublishedSchedule={onEditPublishedSchedule}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    expect(
      screen.getByRole("button", { name: "Draft selector: New Schedule" })
        .className,
    ).toContain("schedule-action-button");
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("New Schedule (blank)"));
    expect(onStartBlankDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit live schedule" }));
    expect(onEditPublishedSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    const row = screen.getByText("Plan A").closest("[data-draft-row]");
    if (!(row instanceof HTMLElement)) throw new Error("draft row missing");
    fireEvent.click(row);
    expect(onPreviewDraft).toHaveBeenCalledWith(draftA.id);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit Plan A" }));
    await waitFor(() => expect(onEditDraft).toHaveBeenCalledWith(draftA.id));
  });

  it("marks only the draft being viewed", () => {
    const menu = (activeDraftId: string | null) => (
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={activeDraftId}
        triggerLabel="Plan A"
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
      />
    );
    const { rerender } = render(menu(draftA.id));
    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: Plan A" }),
    );
    expect(within(screen.getByRole("dialog")).getByText("Viewing")).toBeTruthy();

    rerender(menu(null));
    expect(within(screen.getByRole("dialog")).queryByText("Viewing")).toBeNull();
  });

  it("requires confirmation before deleting a draft", () => {
    const onDeleteDraft = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        triggerLabel="Plan A"
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onDeleteDraft={onDeleteDraft}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: Plan A" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("1 draft")).toBeTruthy();
    expect(within(dialog).getByText(/Revision 2 •/)).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Plan A" }),
    );
    expect(onDeleteDraft).not.toHaveBeenCalled();
    const armed = within(dialog).getByRole("button", {
      name: "Confirm delete Plan A",
    });
    expect(armed.textContent).toBe("Delete?");
    fireEvent.click(armed);

    expect(onDeleteDraft).toHaveBeenCalledWith(draftA);
    expect(within(dialog).queryByText("Enter")).toBeNull();
  });

  it("keeps the row tools on screen, not only on hover", () => {
    const styles = readFileSync("src/styles.css", "utf8");
    const rowTools = styles.match(
      /\.schedule-draft-menu-row > button,\s*\.schedule-draft-menu-template-row > button\s*\{([^}]*)\}/,
    )?.[1];

    expect(rowTools).toContain("color: var(--theme-muted)");
    expect(rowTools).not.toContain("opacity");
  });

  it("names the live draft and lists it last, after the other drafts", () => {
    const planB = { ...draftA, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Plan B" };

    render(
      <DraftDropdownMenu
        drafts={[draftA, planB]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: draftA.name,
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
        canEditPublishedSchedule
        onEditPublishedSchedule={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    const rows = Array.from(document.querySelectorAll("[data-draft-row]"));
    expect(rows.map((row) => row.querySelector("strong")?.textContent)).toEqual(
      ["Plan B", "Plan A"],
    );
    expect(rows[1]?.getAttribute("data-published-draft-row")).toBe("true");
    expect(
      rows[1]?.querySelector(".schedule-draft-menu-title-line")?.textContent,
    ).toBe("Plan APublished");
    expect(document.querySelector("[data-published-fallback-row]")).toBeNull();
    // A row names itself instead of borrowing its buttons' names, so a
    // partial match (as the e2e flows use) finds the one button.
    expect(
      screen.getAllByRole("button", { name: /Edit live schedule/ }),
    ).toHaveLength(1);
    expect(screen.getByRole("button", { name: "View Plan A" })).toBe(rows[1]);
    expect(
      screen.getByRole("button", { name: "View Plan A" }).getAttribute(
        "aria-describedby",
      ),
    ).toBeTruthy();
    expect(
      document.getElementById(
        rows[1]?.getAttribute("aria-describedby") ?? "",
      )?.textContent,
    ).toContain("Published");
  });

  it("names a deleted live draft by the name it was published under", () => {
    render(
      <DraftDropdownMenu
        drafts={[]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: "Week 34 final",
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    const row = document.querySelector("[data-published-fallback-row]");
    expect(
      row?.querySelector(".schedule-draft-menu-title-line")?.textContent,
    ).toBe("Week 34 finalPublished");
    expect(screen.queryByText("Published schedule")).toBeNull();
  });

  it("prefetches drafts on open and highlights the trigger", () => {
    const onPrefetchDraft = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        highlightTrigger
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onPrefetchDraft={onPrefetchDraft}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Draft selector: New Schedule",
    });
    expect(trigger.className).toContain("schedule-new-schedule-highlight");

    fireEvent.click(trigger);

    expect(onPrefetchDraft).toHaveBeenCalledWith(draftA.id);
  });

  it("shows a published source draft row and prevents deleting it", () => {
    const onDeleteDraft = vi.fn();
    const onEditPublishedSchedule = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        triggerLabel="Plan A"
        canEditPublishedSchedule
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: draftA.name,
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        publishedLocationStatuses={[publishedLocation]}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onEditPublishedSchedule={onEditPublishedSchedule}
        onDeleteDraft={onDeleteDraft}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: Plan A" }),
    );

    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.getByText("Main Room")).toBeTruthy();
    expect(screen.getByText("Published").getAttribute("title")).toContain(
      "Published by Mina Yilmaz •",
    );

    const deleteButton = screen.getByRole("button", { name: "Delete Plan A" });
    expect(deleteButton).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Edit live schedule" }));

    expect(onDeleteDraft).not.toHaveBeenCalled();
    expect(onEditPublishedSchedule).toHaveBeenCalledTimes(1);
  });

  it("routes published fallback row preview, edit, and unpublish actions", () => {
    const onPreviewDraft = vi.fn();
    const onEditPublishedSchedule = vi.fn();
    const onUnpublishSchedule = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        canEditPublishedSchedule
        publishedSchedule={{
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        publishedLocationStatuses={[publishedLocation]}
        onPreviewDraft={onPreviewDraft}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onEditPublishedSchedule={onEditPublishedSchedule}
        onUnpublishSchedule={onUnpublishSchedule}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "View published schedule" }),
    );
    expect(onPreviewDraft).toHaveBeenCalledWith(null);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit live schedule" }));
    expect(onEditPublishedSchedule).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Unpublish schedule" }));
    expect(onUnpublishSchedule).toHaveBeenCalledTimes(1);
  });

  it("keeps a published fallback available for preview without edit access", () => {
    const onPreviewDraft = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        canManageDrafts={false}
        canStartDraft={false}
        publishedSchedule={{
          published_at: "2026-08-17T12:45:00Z",
          published_by_name: "Mina Yilmaz",
        }}
        onPreviewDraft={onPreviewDraft}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Draft selector: New Schedule",
    });
    expect(trigger).toHaveProperty("disabled", false);
    fireEvent.click(trigger);

    expect(
      screen.queryByRole("button", { name: "New Schedule (blank)" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit live schedule" }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "View published schedule" }),
    );
    expect(onPreviewDraft).toHaveBeenCalledWith(null);
  });

  it("does not route a published source draft through ordinary draft edit", () => {
    const onEditDraft = vi.fn();
    const onEditPublishedSchedule = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        triggerLabel="Plan A"
        publishedSchedule={{
          source_draft_id: draftA.id,
          source_draft_name: draftA.name,
          published_at: "2026-08-17T12:45:00Z",
        }}
        onPreviewDraft={vi.fn()}
        onEditDraft={onEditDraft}
        onStartBlankDraft={vi.fn()}
        onEditPublishedSchedule={onEditPublishedSchedule}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: Plan A" }),
    );

    expect(
      screen.queryByRole("button", { name: "Edit live schedule" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit Plan A" })).toBeNull();
    expect(onEditDraft).not.toHaveBeenCalled();
    expect(onEditPublishedSchedule).not.toHaveBeenCalled();
  });

  it("routes template apply, manage, rename, delete, and save-as-template actions", () => {
    const onApplyTemplate = vi.fn();
    const onRenameTemplate = vi.fn();
    const onDeleteTemplate = vi.fn();
    const onSaveAsTemplate = vi.fn();
    const onManageTemplates = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        templates={[template]}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onApplyTemplate={onApplyTemplate}
        onRenameTemplate={onRenameTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onSaveAsTemplate={onSaveAsTemplate}
        onManageTemplates={onManageTemplates}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    expect(screen.getByText("Templates")).toBeTruthy();
    expect(screen.getByText("1 template")).toBeTruthy();
    expect(screen.getByText(/6 shifts · 2 open · by Mina Yilmaz/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(onManageTemplates).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Apply template Dinner rush" }),
    );
    expect(onApplyTemplate).toHaveBeenCalledWith(template);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Rename template Dinner rush" }),
    );
    expect(onRenameTemplate).toHaveBeenCalledWith(template);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Delete template Dinner rush" }),
    );
    expect(onDeleteTemplate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm delete template Dinner rush",
      }),
    );
    expect(onDeleteTemplate).toHaveBeenCalledWith(template);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Save current schedule as template",
      }),
    );
    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  });

  it("disables starting and saving as a template when requested", () => {
    const onStartBlankDraft = vi.fn();
    const onSaveAsTemplate = vi.fn();

    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        templates={[]}
        canStartDraft={false}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={onStartBlankDraft}
        onSaveAsTemplate={onSaveAsTemplate}
        saveAsTemplateDisabledReason="Open an edit session first."
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Draft selector: New Schedule" }),
    );

    const startButton = screen.getByRole("button", {
      name: "New Schedule (blank)",
    });
    const saveTemplateButton = screen.getByRole("button", {
      name: "Save current schedule as template",
    });
    expect(startButton).toHaveProperty("disabled", true);
    expect(saveTemplateButton).toHaveProperty("disabled", true);

    fireEvent.click(startButton);
    fireEvent.click(saveTemplateButton);

    expect(onStartBlankDraft).not.toHaveBeenCalled();
    expect(onSaveAsTemplate).not.toHaveBeenCalled();
  });

  // BL-300: Enter on a row's own button belongs to that button, not the row.
  it("leaves Enter on a row's Edit or Delete button to that button", () => {
    const onPreviewDraft = vi.fn();
    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        onPreviewDraft={onPreviewDraft}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draft selector: New Schedule" }));

    for (const name of ["Edit Plan A", "Delete Plan A"]) {
      const notPrevented = fireEvent.keyDown(screen.getByRole("button", { name }), { key: "Enter" });
      expect(notPrevented, name).toBe(true);
    }
    expect(onPreviewDraft).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole("button", { name: "View Plan A" }), { key: "Enter" });
    expect(onPreviewDraft).toHaveBeenCalledWith(draftA.id);
  });

  it("closes on Escape and resets inline delete confirmation", () => {
    render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={draftA.id}
        triggerLabel="Plan A"
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
        onDeleteDraft={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Draft selector: Plan A",
    });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Delete Plan A" }));
    expect(
      screen.getByRole("button", { name: "Confirm delete Plan A" }),
    ).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Delete Plan A" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Confirm delete Plan A" }),
    ).toBeNull();
  });

  it("closes when pointerdown occurs outside the menu", () => {
    render(
      <div>
        <DraftDropdownMenu
          drafts={[draftA]}
          activeDraftId={null}
          triggerLabel="New Schedule"
          onPreviewDraft={vi.fn()}
          onEditDraft={vi.fn()}
          onStartBlankDraft={vi.fn()}
        />
        <button type="button">Outside</button>
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: "Draft selector: New Schedule",
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("reports open state, accepts dismiss signals, and exposes the topbar trigger id", () => {
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        topActionId="templates"
        dismissSignal={0}
        onOpenChange={onOpenChange}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Draft selector: New Schedule",
    });
    expect(trigger.getAttribute("data-schedule-top-action-trigger")).toBe(
      "templates",
    );

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    rerender(
      <DraftDropdownMenu
        drafts={[draftA]}
        activeDraftId={null}
        triggerLabel="New Schedule"
        topActionId="templates"
        dismissSignal={1}
        onOpenChange={onOpenChange}
        onPreviewDraft={vi.fn()}
        onEditDraft={vi.fn()}
        onStartBlankDraft={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
