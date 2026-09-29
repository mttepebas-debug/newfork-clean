import type {
  ScheduleDraftSummary,
  ScheduleEditSession,
  ScheduleTemplateSummary,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ScheduleTemplatesDialog,
  TEMPLATE_NO_DEPARTMENT_KEY,
} from "./ScheduleTemplateDialogs";

const template: ScheduleTemplateSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  name: "Standard week",
  revision: 3,
  shift_count: 8,
  open_slot_count: 2,
  created_by_name: "Manager",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const secondTemplate: ScheduleTemplateSummary = {
  ...template,
  id: "12121212-1212-4121-8121-121212121212",
  name: "Weekend week",
  revision: 1,
  shift_count: 4,
  open_slot_count: 4,
};

const draft: ScheduleDraftSummary = {
  id: "33333333-3333-4333-8333-333333333333",
  workspace_id: template.workspace_id,
  week_start: "2026-08-17",
  name: "Manager edits",
  revision: 2,
  created_by: "44444444-4444-4444-8444-444444444444",
  updated_by: "44444444-4444-4444-8444-444444444444",
  created_at: "2026-08-17T12:00:00.000Z",
  updated_at: "2026-08-17T12:00:00.000Z",
};

const session: ScheduleEditSession = {
  id: "55555555-5555-4555-8555-555555555555",
  workspace_id: template.workspace_id,
  week_start: "2026-08-17",
  source_kind: "draft",
  source_draft_id: draft.id,
  source_revision: 2,
  holder_user_id: "66666666-6666-4666-8666-666666666666",
  location_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
  holder_name: "Manager",
  revision: 4,
  dirty: true,
  last_heartbeat: "2026-08-17T12:00:00.000Z",
  expires_at: "2026-08-17T12:04:00.000Z",
  shifts: [],
};

function buildDialogProps(
  overrides: Partial<Parameters<typeof ScheduleTemplatesDialog>[0]> = {},
) {
  const props: Parameters<typeof ScheduleTemplatesDialog>[0] = {
    templates: [template],
    drafts: [draft],
    session,
    departments: [
      {
        id: "77777777-7777-4777-8777-777777777777",
        name: "Front of house",
        color: "#2563EB",
        sort_order: 0,
        system_key: null,
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Back of house",
        color: "#16A34A",
        sort_order: 1,
        system_key: null,
      },
    ],
    onClose: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onApply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return props;
}

function renderDialog(
  overrides: Partial<Parameters<typeof ScheduleTemplatesDialog>[0]> = {},
) {
  const props = buildDialogProps(overrides);
  render(<ScheduleTemplatesDialog {...props} />);
  return props;
}

describe("ScheduleTemplatesDialog", () => {
  it("deletes a template on the second click, without the browser's confirm box", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const props = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith(template));
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("applies every department as an unfiltered template merge", async () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Apply template" }));

    await waitFor(() =>
      expect(props.onApply).toHaveBeenCalledWith(template.id, "merge", null),
    );
  });

  it("passes selected department keys when applying a filtered template", async () => {
    const props = renderDialog();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Back of house" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply template" }));

    await waitFor(() =>
      expect(props.onApply).toHaveBeenCalledWith(template.id, "merge", [
        "77777777-7777-4777-8777-777777777777",
        TEMPLATE_NO_DEPARTMENT_KEY,
      ]),
    );
  });

  it("blocks template apply when every department is deselected", () => {
    renderDialog();

    fireEvent.click(screen.getByRole("checkbox", { name: "Front of house" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Back of house" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "No department" }));

    expect(screen.getByText("Select at least one department to apply.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply template" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows explicit merge and overwrite decisions when the working copy has shifts", async () => {
    const props = renderDialog({
      session: {
        ...session,
        shifts: [
          {
            id: "99999999-9999-4999-8999-999999999999",
            location_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            employee_id: null,
            job_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            shift_type_id: null,
            scheduled_date: "2026-08-17",
            start_time: "09:00",
            end_time: "17:00",
            crosses_midnight: false,
            unpaid_break_minutes: 30,
            note: "",
            hide_time_on_badge: false,
            revision: 1,
            warning_codes: [],
            label_ids: [],
            label_names: [],
          },
        ],
      },
    });

    expect(
      screen.getByText(/This schedule already has shifts/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Overwrite" }));
    await waitFor(() =>
      expect(props.onApply).toHaveBeenCalledWith(template.id, "overwrite", null),
    );
    fireEvent.click(screen.getByRole("button", { name: "Merge" }));
    await waitFor(() =>
      expect(props.onApply).toHaveBeenCalledWith(template.id, "merge", null),
    );
  });

  it("selects the first template when templates load after the dialog opens", () => {
    const props = buildDialogProps({ templates: [] });
    const { rerender } = render(<ScheduleTemplatesDialog {...props} />);

    rerender(<ScheduleTemplatesDialog {...props} templates={[template]} />);

    expect(
      screen.getByRole("button", { name: /Standard week/ }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      (screen.getAllByLabelText("Template name")[0] as HTMLInputElement).value,
    ).toBe("Standard week");
  });

  it("falls back to the next available template when the selected one is removed", () => {
    const props = buildDialogProps({ templates: [template, secondTemplate] });
    const { rerender } = render(<ScheduleTemplatesDialog {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Weekend week/ }));
    expect(
      (screen.getAllByLabelText("Template name")[0] as HTMLInputElement).value,
    ).toBe("Weekend week");

    rerender(<ScheduleTemplatesDialog {...props} templates={[template]} />);

    expect(
      (screen.getAllByLabelText("Template name")[0] as HTMLInputElement).value,
    ).toBe("Standard week");
  });
});
