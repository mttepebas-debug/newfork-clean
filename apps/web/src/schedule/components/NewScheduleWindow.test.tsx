import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleDraftSummary, ScheduleTemplateSummary } from "@newfork/shared/schedule";

import type { NewScheduleTemplatesStep } from "./NewScheduleTemplates";
import { NewScheduleWindow, type NewScheduleTab, type NewScheduleWindowProps } from "./NewScheduleWindow";

const WEEK = "2026-08-17";
function draft(id: string, name: string, extra: Record<string, unknown> = {}): ScheduleDraftSummary {
  return {
    id, workspace_id: "11111111-1111-4111-8111-111111111111", week_start: WEEK, name, revision: 1,
    created_by: "88888888-8888-4888-8888-888888888888", updated_by: "88888888-8888-4888-8888-888888888888",
    created_at: "2026-08-17T12:00:00Z", updated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), ...extra,
  } as ScheduleDraftSummary;
}
const LIVE = draft("99999999-9999-4999-8999-999999999981", "Week plan v1", { shift_count: 12, paid_minutes: 5040, updated_by_name: "Olcay Owner" });
const OTHER = draft("99999999-9999-4999-8999-999999999982", "Plan B", { shift_count: 3, paid_minutes: 450, updated_by_name: "Derya Manager" });
const TEMPLATE: ScheduleTemplateSummary = {
  id: "99999999-9999-4999-8999-999999999971", workspace_id: LIVE.workspace_id, name: "Lunch week", revision: 1,
  shift_count: 4, open_slot_count: 1, created_by_name: "Olcay Owner", updated_at: "2026-08-17T12:00:00Z",
};

type Overrides = Partial<NewScheduleWindowProps> & {
  readonly session?: boolean;
  readonly templateProps?: Partial<NonNullable<NewScheduleWindowProps["templates"]>>;
};
function Harness({ initialTab = "schedules", session = false, templateProps, ...overrides }: Overrides & { readonly initialTab?: NewScheduleTab }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<NewScheduleTab>(initialTab);
  const [step, setStep] = useState<NewScheduleTemplatesStep>({ kind: "list" });
  const [saving, setSaving] = useState(false);
  const props: NewScheduleWindowProps = {
    open, tab, onOpenChange: setOpen, onTabChange: setTab,
    tabs: { schedules: true, templates: true, export: true },
    triggerLabel: "New Schedule", weekStart: WEEK, drafts: [LIVE, OTHER],
    publishedFacts: { shift_count: 12, paid_minutes: 5040 },
    publishedSchedule: { published_at: "2026-08-17T10:00:00Z", published_by_name: "Olcay Owner", source_draft_id: LIVE.id, source_draft_name: LIVE.name },
    activeDraftId: null, editing: false, editingName: null, canManageDrafts: true, canStartDraft: true, isStartingDraft: false,
    canEditPublishedSchedule: true, readOnlyNote: null,
    onPreviewDraft: vi.fn(), onEditDraft: vi.fn(), onEditPublishedSchedule: vi.fn(), onStartBlankDraft: vi.fn(), onDeleteDraft: vi.fn(),
    onUnpublishSchedule: vi.fn(),
    templates: {
      templates: [TEMPLATE], loading: false, loadError: false, onRetry: vi.fn(), canManage: true, drafts: [LIVE, OTHER], departments: [],
      session: session ? ({ id: "s", shifts: [{ id: "x" }] } as never) : null,
      saving, onSavingChange: setSaving, draftOnScreen: null, step, onStepChange: setStep,
      canStartEdit: true, onUseInto: vi.fn(), onCreate: vi.fn(async () => undefined), onRename: vi.fn(async () => undefined),
      onDelete: vi.fn(async () => undefined), onApply: vi.fn(async () => undefined), onPreviewReplace: vi.fn(async () => 2),
      ...templateProps,
    },
    exportPane: <p>Export settings here</p>,
    ...overrides,
  };
  return <NewScheduleWindow {...props} />;
}

function openWindow() {
  fireEvent.click(screen.getByRole("button", { name: "Draft selector: New Schedule" }));
  return screen.getByRole("dialog", { name: /^Schedules for / });
}

describe("New Schedule window (Mert, 2026-10-12, design B)", () => {
  it("lists the live schedule first, then the drafts, each with its shifts and paid hours", () => {
    render(<Harness />);
    const windowRoot = openWindow();
    const rows = within(windowRoot).getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector(".new-schedule-window-open b")?.textContent)).toEqual(["Week plan v1", "Plan B"]);
    expect(rows[0]!.textContent).toContain("Live · published by Olcay Owner,");
    expect(rows[0]!.textContent).toContain("12 shifts");
    expect(rows[0]!.textContent).toContain("84 h");
    expect(rows[1]!.textContent).toContain("Draft · saved by Derya Manager, 2 h ago");
    expect(rows[1]!.textContent).toContain("7.5 h");
    // The live schedule is unpublished, never deleted; a draft is deleted with two clicks.
    expect(within(rows[0]!).getByRole("button", { name: "Unpublish schedule" })).toBeTruthy();
    expect(within(rows[1]!).getByRole("button", { name: "Delete Plan B" })).toBeTruthy();
  });

  // Editing takes requests: the window stays until the page holds the edit and
  // closes it (SchedulePage), saying "Starting…" meanwhile.
  it("shows a schedule on the grid from its row, closing the window, and edits it from the pencil", () => {
    const onPreviewDraft = vi.fn();
    const onEditDraft = vi.fn();
    render(<Harness onPreviewDraft={onPreviewDraft} onEditDraft={onEditDraft} />);
    let windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByText("Plan B").closest("li")!);
    expect(onPreviewDraft).toHaveBeenCalledWith(OTHER.id);
    expect(screen.queryByRole("dialog")).toBeNull();
    windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Edit Plan B" }));
    expect(onEditDraft).toHaveBeenCalledWith(OTHER.id);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("says Starting… and holds every edit while one is on its way", () => {
    render(<Harness isStartingDraft />);
    const windowRoot = openWindow();
    const starting = within(windowRoot).getByRole("button", { name: "Starting…" });
    expect((starting as HTMLButtonElement).disabled).toBe(true);
    expect((within(windowRoot).getByRole("button", { name: "Edit Plan B" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("offers only the tabs the person may use, and draws Export only on its tab", () => {
    render(<Harness tabs={{ schedules: false, templates: false, export: true }} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Export"]);
    expect(within(windowRoot).getByText("Export settings here")).toBeTruthy();
    expect(within(windowRoot).queryByRole("button", { name: "Blank schedule" })).toBeNull();
  });

  it("keeps one green button in one place: Blank schedule on Schedules, Save template on Templates", () => {
    render(<Harness />);
    const windowRoot = openWindow();
    const blank = within(windowRoot).getByRole("button", { name: "Blank schedule" });
    fireEvent.click(within(windowRoot).getByRole("tab", { name: /^Templates/ }));
    const save = within(windowRoot).getByRole("button", { name: "Save template" });
    expect(blank.className).toBe(save.className);
    // The width is fixed, so the button does not move when the tab changes (Mert, 2026-10-12 18:29 PT).
    const css = readFileSync("src/schedule/components/new-schedule-window.css", "utf8");
    expect(css).toMatch(/\.nf-button\.new-schedule-window-main \{[^}]*width: 138px;/);
    fireEvent.click(save);
    expect(within(windowRoot).getByRole("region", { name: "Save a draft as a template" })).toBeTruthy();
  });

  it("while an edit is open, says so and starts or opens nothing else", () => {
    render(<Harness editing editingName="Plan B" activeDraftId={OTHER.id} canManageDrafts={false} canStartDraft={false} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).getByRole("status").textContent).toContain("You are editing Plan B.");
    expect(within(windowRoot).queryByRole("button", { name: "Blank schedule" })).toBeNull();
    expect(within(windowRoot).getByRole("button", { name: "View Week plan v1" })).toHaveProperty("disabled", true);
    expect(within(windowRoot).queryByRole("button", { name: "Delete Plan B" })).toBeNull();
  });

  it("closes on Escape, but Escape in a template's menu only closes the menu", () => {
    render(<Harness initialTab="templates" />);
    const windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "More for Lunch week" }));
    const menu = screen.getByRole("menu", { name: "More for Lunch week" });
    fireEvent.keyDown(within(menu).getByRole("menuitem", { name: "Rename" }), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: /^Schedules for / })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("New Schedule window · Templates · reading and refusals", () => {
  // A role may read templates without managing them: it sees the list, nothing it cannot do.
  it("shows a reader the templates with no Save template, Use or row menu", () => {
    render(<Harness initialTab="templates" templateProps={{ canManage: false }} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).getByText("Lunch week")).toBeTruthy();
    expect(within(windowRoot).queryByRole("button", { name: "Save template" })).toBeNull();
    expect(within(windowRoot).queryByRole("button", { name: "Use template Lunch week" })).toBeNull();
    expect(within(windowRoot).queryByRole("button", { name: "More for Lunch week" })).toBeNull();
  });

  it("says the list did not load and offers Try again, instead of 'No templates yet'", () => {
    const onRetry = vi.fn();
    render(<Harness initialTab="templates" templateProps={{ templates: [], loadError: true, onRetry }} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).queryByText(/No templates yet/)).toBeNull();
    expect(within(windowRoot).getByRole("heading", { name: "We couldn't load templates" })).toBeTruthy();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("shows the list in grey while templates load", () => {
    render(<Harness initialTab="templates" templateProps={{ templates: [], loading: true }} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).getByText("Loading templates")).toBeTruthy();
    expect(within(windowRoot).queryByText(/No templates yet/)).toBeNull();
  });

  it("keeps the last templates with a refresh line when a reload fails", () => {
    const onRetry = vi.fn();
    render(<Harness initialTab="templates" templateProps={{ loadError: true, onRetry }} />);
    const windowRoot = openWindow();
    expect(within(windowRoot).getByText("Lunch week")).toBeTruthy();
    expect(
      within(windowRoot).getByText("Templates didn't refresh. This is the last list that loaded."),
    ).toBeTruthy();
    expect(within(windowRoot).queryByRole("heading", { name: "We couldn't load templates" })).toBeNull();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  // BL-1044: the refusal's key, not the server's words, says what happened.
  it.each([
    [{ reason: "schedule.template_changed", error: "schedule template revision stale" }, "This template changed. Refresh and try again."],
    [{ status: "name_taken", error: "name taken" }, "A template with this name already exists."],
    [{ error: "boom" }, "The template could not be renamed. Try again."],
  ])("a refused rename says it plainly (%o)", async (body, text) => {
    const refusal = Object.assign(new Error(String(body.error)), { status: 409, body });
    render(<Harness initialTab="templates" templateProps={{ onRename: vi.fn(async () => { throw refusal; }) }} />);
    const windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "More for Lunch week" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    fireEvent.change(within(windowRoot).getByLabelText("Template name"), { target: { value: "Dinner week" } });
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Save" }));
    expect((await within(windowRoot).findByRole("alert")).textContent).toBe(text);
  });
});

describe("New Schedule window · Templates · Use", () => {
  it("with no edit open, asks which schedule it goes into, the one on screen first, then opens it for editing", () => {
    const onUseInto = vi.fn();
    render(<Harness initialTab="templates" activeDraftId={OTHER.id} templateProps={{ onUseInto }} />);
    const windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Use template Lunch week" }));
    const group = within(windowRoot).getByRole("group", { name: "Which schedule should it go into?" });
    const picked = within(group).getAllByRole("radio").find((radio) => (radio as HTMLInputElement).checked)!;
    expect(picked.closest("label")?.textContent).toContain("Plan B");
    expect(within(group).getByText("New blank draft")).toBeTruthy();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Open for editing" }));
    expect(onUseInto).toHaveBeenCalledWith(TEMPLATE.id, { kind: "draft", draftId: OTHER.id });
  });

  // A workspace with no departments has nothing to narrow: Add and Replace work on the whole template.
  it("in an open edit, goes straight to Add or Replace, and Replace first says how many shifts it removes", async () => {
    const onPreviewReplace = vi.fn(async () => 7);
    render(<Harness initialTab="templates" session templateProps={{ onPreviewReplace }} />);
    const windowRoot = openWindow();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Use template Lunch week" }));
    expect(within(windowRoot).queryByRole("group", { name: "Which schedule should it go into?" })).toBeNull();
    expect(within(windowRoot).getByRole("button", { name: "Add to current shifts" })).toBeTruthy();
    fireEvent.click(within(windowRoot).getByRole("button", { name: "Replace current shifts" }));
    expect(await within(windowRoot).findByText("7 shifts will be removed. Draft only, not published.")).toBeTruthy();
    expect(onPreviewReplace).toHaveBeenCalledWith(TEMPLATE.id, null);
  });
});
