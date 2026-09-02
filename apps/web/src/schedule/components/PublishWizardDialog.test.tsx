import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  SchedulePublicationPreview,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import { PublishWizardDialog } from "./PublishWizardDialog";
import { previewSchedulePublication } from "../schedule-data";

vi.mock("../schedule-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../schedule-data")>();
  return {
    ...actual,
    previewSchedulePublication: vi.fn(),
  };
});

const previewMock = vi.mocked(previewSchedulePublication);

const preview: SchedulePublicationPreview = {
  status: "publish_ready",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  week_start: "2026-08-17",
  draft_id: "11111111-1111-4111-8111-111111111111",
  draft_revision: 3,
  fingerprint: "a".repeat(64),
  locations: [
    {
      location_id: "44444444-4444-4444-8444-444444444444",
      location_name: "Main Dining",
      active_publication_id: null,
      active_version: null,
      current_shift_count: 0,
      next_shift_count: 1,
      added: 1,
      updated: 0,
      removed: 0,
      unchanged: 0,
      affected_employee_ids: ["55555555-5555-4555-8555-555555555555"],
    },
  ],
  findings: [],
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

describe("PublishWizardDialog", () => {
  it("adapts the reference publish wizard API to the clean dialog", async () => {
    previewMock.mockResolvedValue(preview);
    const onPublish = vi.fn().mockResolvedValue({ status: "published" });
    const onOpenChange = vi.fn();

    const { container } = render(
      <PublishWizardDialog
        open
        orgId="22222222-2222-4222-8222-222222222222"
        weekStart="2026-08-17"
        draft={{
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "22222222-2222-4222-8222-222222222222",
          week_start: "2026-08-17",
          name: "Service week",
          revision: 3,
        }}
        locations={[
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Main Dining",
            color: "#123456",
            publication_status: "published",
          },
          {
            id: "66666666-6666-4666-8666-666666666666",
            name: "Patio",
          },
        ]}
        employees={[
          {
            id: "55555555-5555-4555-8555-555555555555",
            display_name: "Alex Rivera",
            color: "#abcdef",
          },
        ]}
        initialLocationIds={["44444444-4444-4444-8444-444444444444"]}
        onOpenChange={onOpenChange}
        onPublish={onPublish}
      />,
    );

    expect(screen.getByText("1 of 2 locations selected")).toBeTruthy();
    expect(container.querySelector('[style*="rgb(18, 52, 86)"]')).toBeTruthy();

    await waitFor(() =>
      expect(previewMock).toHaveBeenCalledWith(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        ["44444444-4444-4444-8444-444444444444"],
        {},
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(
      container.querySelector('[style*="rgb(171, 205, 239)"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![0]).toMatchObject({
      locationIds: ["44444444-4444-4444-8444-444444444444"],
      notifyEmployeeIds: ["55555555-5555-4555-8555-555555555555"],
      expectedPublicationId: null,
      preflightAck: {
        fingerprint: preview.fingerprint,
        decisions: [],
      },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("adapts reference department publish scope", async () => {
    previewMock.mockResolvedValue(preview);
    const onPublish = vi.fn().mockResolvedValue({ status: "published" });

    render(
      <PublishWizardDialog
        open
        orgId="22222222-2222-4222-8222-222222222222"
        weekStart="2026-08-17"
        draft={{
          id: "11111111-1111-4111-8111-111111111111",
          organization_id: "22222222-2222-4222-8222-222222222222",
          week_start: "2026-08-17",
          name: "Service week",
          revision: 3,
        }}
        locations={[
          {
            id: "44444444-4444-4444-8444-444444444444",
            name: "Main Dining",
            publication_status: "published",
          },
        ]}
        departments={[department, backDepartment]}
        employees={[
          {
            id: "55555555-5555-4555-8555-555555555555",
            display_name: "Alex Rivera",
          },
        ]}
        initialLocationIds={["44444444-4444-4444-8444-444444444444"]}
        onOpenChange={vi.fn()}
        onPublish={onPublish}
      />,
    );

    fireEvent.click(screen.getByLabelText("Back of House"));

    await waitFor(() =>
      expect(previewMock).toHaveBeenCalledWith(
        "22222222-2222-4222-8222-222222222222",
        "11111111-1111-4111-8111-111111111111",
        ["44444444-4444-4444-8444-444444444444"],
        {
          departmentIds: [department.id],
          includeNoDepartment: true,
        },
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
        "disabled",
        false,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![0]).toMatchObject({
      departmentIds: [department.id],
      includeNoDepartment: true,
    });
  });
});
