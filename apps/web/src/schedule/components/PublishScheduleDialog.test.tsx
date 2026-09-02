import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  ScheduleReadModel,
  SchedulePublicationPreview,
} from "@newfork/shared/schedule";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import { PublishScheduleDialog } from "./PublishScheduleDialog";

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

const activeDraft: ScheduleDraftSummary = {
  ...draft,
  id: "77777777-7777-4777-8777-777777777777",
  name: "Active service week",
  revision: 5,
};

const location: ScheduleLocation = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  sort_order: 0,
  publication_status: "published",
  published_at: "2026-08-17T12:00:00Z",
};

const patioLocation: ScheduleLocation = {
  id: "99999999-9999-4999-8999-999999999999",
  name: "Patio",
  timezone: "America/Los_Angeles",
  sort_order: 1,
  publication_status: "unpublished",
  published_at: null,
};

const employee: ScheduleEmployee = {
  id: "55555555-5555-4555-8555-555555555555",
  employee_code: "NF-001",
  display_name: "Alex Rivera",
  location_ids: [location.id],
  job_ids: ["66666666-6666-4666-8666-666666666666"],
  primary_job_id: "66666666-6666-4666-8666-666666666666",
  is_excluded_from_schedule: false,
  availability: null,
};

const department: ScheduleReadModel["departments"][number] = {
  id: "12121212-1212-4121-8121-121212121212",
  name: "Front of House",
  color: "#176954",
  sort_order: 0,
};

const backDepartment: ScheduleReadModel["departments"][number] = {
  id: "34343434-3434-4343-8434-343434343434",
  name: "Back of House",
  color: "#8d4a2f",
  sort_order: 1,
};

const preview: SchedulePublicationPreview = {
  status: "publish_ready",
  workspace_id: draft.workspace_id,
  week_start: draft.week_start,
  draft_id: draft.id,
  draft_revision: draft.revision,
  fingerprint: "a".repeat(64),
  locations: [
    {
      location_id: location.id,
      location_name: location.name,
      active_publication_id: null,
      active_version: null,
      current_shift_count: 2,
      next_shift_count: 2,
      added: 1,
      updated: 1,
      removed: 1,
      unchanged: 1,
      affected_employee_ids: [employee.id],
    },
  ],
  findings: [],
};

function publishFinding(
  overrides: Partial<SchedulePublicationPreview["findings"][number]> = {},
): SchedulePublicationPreview["findings"][number] {
  return {
    id: "finding-0001",
    code: "availability",
    severity: "soft",
    overrideable: true,
    tier: "blocker",
    introduced: true,
    projected: true,
    message: "Alex is outside availability.",
    location_id: location.id,
    location_name: location.name,
    employee_id: employee.id,
    employee_name: employee.display_name,
    scheduled_date: "2026-08-17",
    date: "2026-08-17",
    shift_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
    ...overrides,
  };
}

async function clickReadyNext(): Promise<void> {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

describe("PublishScheduleDialog", () => {
  it("publishes the explicitly active draft instead of the first saved draft", async () => {
    const activePreview = {
      ...preview,
      draft_id: activeDraft.id,
      draft_revision: activeDraft.revision,
    };
    const onPreview = vi.fn().mockResolvedValue(activePreview);

    render(
      <PublishScheduleDialog
        drafts={[draft, activeDraft]}
        activeDraftId={activeDraft.id}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    expect(
      (screen.getByLabelText("Saved draft") as HTMLSelectElement).value,
    ).toBe(activeDraft.id);
    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(activeDraft.id, [location.id], {}),
    );
  });

  it("dismisses from backdrop or Escape without forwarding the interaction", async () => {
    const onClose = vi.fn();
    const onOutsidePointerDown = vi.fn();
    const onOutsideClick = vi.fn();
    const onPreview = vi.fn().mockResolvedValue(preview);

    render(
      <div onPointerDown={onOutsidePointerDown} onClick={onOutsideClick}>
        <PublishScheduleDialog
          drafts={[draft]}
          locations={[location]}
          employees={[employee]}
          onClose={onClose}
          onPreview={onPreview}
          onPublish={vi.fn()}
        />
      </div>,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
        "disabled",
        false,
      ),
    );

    const backdrop = screen.getByRole("button", { name: "Close dialog" });
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOutsidePointerDown).not.toHaveBeenCalled();
    expect(onOutsideClick).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("previews and publishes selected locations with employee notifications", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onPublish = vi.fn().mockResolvedValue(undefined);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Select locations to publish" }),
    ).toBeTruthy();
    expect(screen.getByText("1 of 1 locations selected")).toBeTruthy();
    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(draft.id, [location.id], {}),
    );
    expect(screen.getByText("Live · 2 shifts")).toBeTruthy();
    expect(screen.getByText("1 new")).toBeTruthy();
    expect(screen.getByText("1 updated")).toBeTruthy();
    expect(screen.getByText("1 removed")).toBeTruthy();
    await clickReadyNext();
    await waitFor(() =>
      expect(screen.getAllByText("Ready to publish").length).toBeGreaterThan(0),
    );
    expect(
      screen.getByRole("dialog", { name: "Pre-flight check" }),
    ).toBeTruthy();
    expect(screen.getByTestId("schedule-publish-preview")).toBeTruthy();
    expect(screen.getByText("No blockers or risks")).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Search employees" }),
    ).toBeNull();
    await clickReadyNext();
    expect(screen.getByRole("dialog", { name: "Notify employees" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByText("1 of 1 selected")).toBeTruthy();
    expect(
      screen.getByText("Only employees with schedule changes are listed."),
    ).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "Search employees" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish).toHaveBeenCalledWith(
      preview,
      [],
      [employee.id],
      {
        fingerprint: preview.fingerprint,
        decisions: [],
      },
      {},
    );
  });

  it("refreshes the location preview when publish reports a stale baseline", async () => {
    const refreshedPreview: SchedulePublicationPreview = {
      ...preview,
      fingerprint: "b".repeat(64),
      locations: [
        {
          ...preview.locations[0]!,
          current_shift_count: 3,
          next_shift_count: 4,
          added: 2,
          updated: 1,
          removed: 0,
          unchanged: 1,
        },
      ],
    };
    const onPreview = vi
      .fn()
      .mockResolvedValueOnce(preview)
      .mockResolvedValueOnce(refreshedPreview);
    const onPublish = vi.fn().mockRejectedValueOnce(
      new ScheduleRequestError("stale baseline", 409, {
        status: "stale_baseline",
      }),
    );

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
      />,
    );

    await clickReadyNext();
    await waitFor(() =>
      expect(screen.getAllByText("Ready to publish").length).toBeGreaterThan(0),
    );
    await clickReadyNext();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    expect(
      await screen.findByText(
        "The published schedule changed while this dialog was open. Review the locations again.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog", { name: "Select locations to publish" })).toBeTruthy();
    expect(screen.getByText("Live · 3 shifts")).toBeTruthy();
    expect(screen.getByText("2 new")).toBeTruthy();
    expect(screen.getByText("1 updated")).toBeTruthy();
  });

  it("shows publish preview loading and retry states on the location step", async () => {
    const onPreview = vi
      .fn()
      .mockRejectedValueOnce(new Error("preview failed"))
      .mockResolvedValue(preview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    expect(await screen.findByText("Loading publish preview")).toBeTruthy();
    expect(
      await screen.findByText("Publish preview could not be loaded."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Live · 2 shifts")).toBeTruthy();
  });

  it("shows notify search only when many employees are affected", async () => {
    const manyEmployees = Array.from({ length: 15 }, (_, index) => ({
      ...employee,
      id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
      employee_code: `NF-${String(index + 1).padStart(3, "0")}`,
      display_name: `Employee ${index + 1}`,
    }));
    const manyPreview: SchedulePublicationPreview = {
      ...preview,
      locations: [
        {
          ...preview.locations[0]!,
          affected_employee_ids: manyEmployees.map((item) => item.id),
        },
      ],
    };
    const onPreview = vi.fn().mockResolvedValue(manyPreview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={manyEmployees}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    await clickReadyNext();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      screen.getByRole("textbox", { name: "Search employees" }),
    ).toBeTruthy();
  });

  it("previews and publishes a scoped department selection", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onPublish = vi.fn().mockResolvedValue(undefined);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        departments={[department, backDepartment]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
      />,
    );

    fireEvent.click(screen.getByLabelText("Back of House"));

    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(draft.id, [location.id], {
        departmentIds: [department.id],
        includeNoDepartment: true,
      }),
    );

    await clickReadyNext();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish).toHaveBeenCalledWith(
      preview,
      [],
      [employee.id],
      {
        fingerprint: preview.fingerprint,
        decisions: [],
      },
      {
        departmentIds: [department.id],
        includeNoDepartment: true,
      },
    );
  });

  it("keeps the pre-flight step locked until overrideable blockers have written reasons", async () => {
    const blockerPreview: SchedulePublicationPreview = {
      ...preview,
      status: "override_required",
      findings: [publishFinding()],
    };
    const onPreview = vi.fn().mockResolvedValue(blockerPreview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    await clickReadyNext();

    const proceed = await screen.findByRole("button", {
      name: "Override and continue",
    });
    expect(proceed).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "too short" },
    });
    expect(screen.getByText("At least 10 characters.")).toBeTruthy();
    expect(proceed).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Employee agreed to work this shift." },
    });
    await waitFor(() => expect(proceed).toHaveProperty("disabled", false));
  });

  it("never lets a non-overrideable blocker advance from pre-flight review", async () => {
    const hardPreview: SchedulePublicationPreview = {
      ...preview,
      status: "hard_blocked",
      findings: [
        publishFinding({
          id: "finding-hard-0001",
          code: "double_booking",
          severity: "hard",
          overrideable: false,
          message: "Alex is double-booked.",
        }),
      ],
    };
    const onPreview = vi.fn().mockResolvedValue(hardPreview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    await clickReadyNext();

    expect(await screen.findByText("Must be fixed in the schedule")).toBeTruthy();
    expect(screen.getByText("Alex is double-booked.")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Override and continue" }),
    ).toHaveProperty("disabled", true);
  });

  it("returns to location selection when publish reports schedule conflicts", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onPublish = vi.fn().mockRejectedValue(
      new ScheduleRequestError("schedule conflicts", 409, {
        status: "schedule_conflicts",
        schedule_conflicts: [
          {
            employee_id: employee.id,
            employee_name: employee.display_name,
            date: "2026-08-17",
            first: {
              shift_id: "77777777-7777-4777-8777-777777777777",
              time_range: "4:00 PM - 7:00 PM",
            },
            second: {
              shift_id: "88888888-8888-4888-8888-888888888888",
              time_range: "6:00 PM - 10:00 PM",
            },
          },
        ],
      }),
    );

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
      />,
    );

    await clickReadyNext();
    await waitFor(() =>
      expect(screen.getAllByText("Ready to publish").length).toBeGreaterThan(0),
    );
    await clickReadyNext();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    expect(
      await screen.findByText(
        "Schedule conflicts must be fixed before publishing",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Alex Rivera: 2026-08-17, 4:00 PM - 7:00 PM and 6:00 PM - 10:00 PM",
      ),
    ).toBeTruthy();
    expect(screen.getByText("1 conflicts must be fixed")).toBeTruthy();
  });

  it("starts from the caller's scoped location selection", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location, patioLocation]}
        employees={[employee]}
        initialLocationIds={[patioLocation.id]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    expect(screen.getByText("1 of 2 locations selected")).toBeTruthy();
    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(draft.id, [patioLocation.id], {}),
    );
  });

  it("shows location publish summary warnings on the selection step", async () => {
    const removalPreview: SchedulePublicationPreview = {
      ...preview,
      locations: [
        {
          location_id: location.id,
          location_name: location.name,
          active_publication_id: "66666666-6666-4666-8666-666666666666",
          active_version: 2,
          current_shift_count: 3,
          next_shift_count: 0,
          added: 0,
          updated: 0,
          removed: 3,
          unchanged: 0,
          affected_employee_ids: [],
        },
      ],
    };
    const onPreview = vi.fn().mockResolvedValue(removalPreview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("All 3 live shifts at this location will be removed."),
    ).toBeTruthy();
  });
});
