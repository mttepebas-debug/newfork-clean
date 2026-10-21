import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  ScheduleReadModel,
  SchedulePublicationPreview,
} from "@newfork/shared/schedule";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ScheduleRequestError } from "../schedule-data";
import { UNREACHABLE } from "../../lib/request-error";
import { PublishScheduleDialog, type SchedulePublicationChoices } from "./PublishScheduleDialog";
const toast = vi.hoisted(() => ({ warning: vi.fn() }));
vi.mock("@newfork/ui", () => ({ useToast: () => toast }));
beforeEach(() => toast.warning.mockClear());

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
};

const department: ScheduleReadModel["departments"][number] = {
  id: "12121212-1212-4121-8121-121212121212",
  name: "Front of House",
  color: "#176954",
  
  system_key: null,
};

const backDepartment: ScheduleReadModel["departments"][number] = {
  id: "34343434-3434-4343-8434-343434343434",
  name: "Back of House",
  color: "#8d4a2f",
  
  system_key: null,
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
      changed_since_start: null,
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
    code: "schedule_conflict",
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
  const warnPreview = { ...preview, fingerprint: "b".repeat(64), findings: [publishFinding({ id: "warn-finding-0001", availability_state: "new", warning_policy: "warn", tier: "note" })] };
  const staleError = (next: SchedulePublicationPreview) => new ScheduleRequestError("stale publication preview", 409, { status: "preflight", preflight: next, preflight_block_reason: "stale_fingerprint" });
  async function startPublication(onPublish: ReturnType<typeof vi.fn>, initial = preview, onClose = vi.fn()) {
    const h = render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={onClose} onPreview={vi.fn().mockResolvedValue(initial)} onPublish={onPublish} />);
    await clickReadyNext();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" })); });
    return h;
  }
  it("says what each step does and shows what needs attention before the counts", async () => {
    const riskPreview: SchedulePublicationPreview = {
      ...preview,
      status: "override_required",
      findings: [publishFinding({ id: "risk-finding-0001", tier: "risk", message: "Alex closes Friday and opens Saturday." })],
    };
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(riskPreview)} onPublish={vi.fn()} />);

    expect(screen.getByText(/Nothing is published until the last step\./)).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".schedule-publication-summary")).not.toBeNull());
    const summary = document.querySelector(".schedule-publication-summary")?.textContent ?? "";
    expect(summary).toContain("Service week");
    expect(summary).toContain("1 location");
    expect(summary).toContain("2 shifts");
    // BILDIRIM-U3 (S-126): the people the publish tells, the preview's affected people.
    expect(summary).toContain("1 person will be told");

    await clickReadyNext();
    const review = await screen.findByTestId("schedule-publish-preview");
    expect(screen.getByText(/Review what needs attention first/)).toBeTruthy();
    const panel = review.querySelector("[data-publish-preflight]");
    const diff = review.querySelector(".schedule-publication-diff");
    expect(panel && diff && panel.compareDocumentPosition(diff) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One summary of the findings in the body, not the dialog's and the panel's both.
    expect(within(review).getAllByText("1 shift to review before you publish.")).toHaveLength(1);
  });

  // BL-311, BL-441 (KARARLAR:524): the count is said once, at the top, in plain words; the footer repeats nothing.
  it.each([
    [1, "1 shift needs a fix before you can publish. 1 more to review."],
    [2, "2 shifts need a fix before you can publish. 2 more to review."],
  ])("counts %i fix and review once, at the top, in the right number", async (count, summary) => {
    const findings = Array.from({ length: count }, (_unused, index) => [
      publishFinding({ id: `blocker-finding-000${index}`, code: "double_booking", shift_ids: [`aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`] }),
      publishFinding({ id: `risk-finding-000${index}`, code: "double_booking", tier: "risk", shift_ids: [`bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index}`] }),
    ]).flat();
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue({ ...preview, status: "override_required", findings })} onPublish={vi.fn()} />);

    await clickReadyNext();
    await screen.findByTestId("schedule-publish-preview");
    expect(screen.getByText(summary)).toBeTruthy();
    expect(document.querySelector(".schedule-publication-footer-summary")?.textContent).toBe("");
  });

  it("names each draft without its revision number (BL-038 K5)", () => {
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(preview)} onPublish={vi.fn()} />);
    expect(screen.getByRole("option", { name: "Service week" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /revision/i })).toBeNull();
  });

  it("never labels another draft's counts with the newly chosen draft's name", async () => {
    const onPreview = vi.fn()
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(new Error("Preview failed"));
    render(<PublishScheduleDialog drafts={[draft, activeDraft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={onPreview} onPublish={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".schedule-publication-summary")?.textContent).toContain("Service week"));

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Saved draft"), { target: { value: activeDraft.id } });
    });
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    expect(document.querySelector(".schedule-publication-summary")).toBeNull();
  });

  // BL-299: the old draft's check must not carry the new draft into review.
  it("does not move on with the old draft's check when the new draft's check fails", async () => {
    const onPreview = vi.fn()
      .mockResolvedValueOnce(preview)
      .mockRejectedValue(new Error("Preview failed"));
    render(<PublishScheduleDialog drafts={[draft, activeDraft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={onPreview} onPublish={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".schedule-publication-summary")).not.toBeNull());

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Saved draft"), { target: { value: activeDraft.id } });
    });
    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    });

    expect(screen.queryByTestId("schedule-publish-preview")).toBeNull();
    expect(onPreview).toHaveBeenCalledTimes(3);
    expect(onPreview.mock.calls[2]![0]).toBe(activeDraft.id);
  });

  // BL-301: closing mid-send would drop the result, so a failure went unseen.
  it("stays open while a publication is sending and shows how it ended", async () => {
    let reject!: (error: unknown) => void;
    const onPublish = vi.fn().mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const onClose = vi.fn();
    await startPublication(onPublish, preview, onClose);

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    for (const cancel of screen.queryAllByRole("button", { name: "Cancel" })) fireEvent.click(cancel);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => { reject(new ScheduleRequestError(UNREACHABLE, 0, null)); });
    expect(await screen.findByText(UNREACHABLE)).toBeTruthy();
  });

  // BL-108: a live location with no shifts is still published.
  it("calls a published location with no live shifts published", async () => {
    const empty: SchedulePublicationPreview = {
      ...preview,
      locations: [{ ...preview.locations[0]!, current_shift_count: 0 }],
    };
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(empty)} onPublish={vi.fn()} />);
    await waitFor(() => expect(document.querySelector(".schedule-publication-summary")).not.toBeNull());

    expect(screen.queryByText("Not published yet")).toBeNull();
    expect(screen.getByText("Published now")).toBeTruthy();
  });

  it("continues a changed warn-only publication once with current evidence", async () => {
    const onPublish = vi.fn().mockRejectedValueOnce(staleError(warnPreview)).mockResolvedValue({});
    await startPublication(onPublish);
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(2));
    expect(onPublish.mock.calls[1]![0]).toEqual(warnPreview);
    expect(onPublish.mock.calls[1]![2]).toMatchObject({ fingerprint: warnPreview.fingerprint, decisions: [{ finding_id: "warn-finding-0001" }] });
    expect(toast.warning).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Confirm availability and continue" })).toBeNull();
  });
  it("continues when previous warn conflicts disappear", async () => {
    const cleared = { ...preview, fingerprint: "c".repeat(64) };
    const onPublish = vi.fn().mockRejectedValueOnce(staleError(cleared)).mockResolvedValue({});
    await startPublication(onPublish, warnPreview);
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(2));
    expect(onPublish.mock.calls[1]![1]).toEqual([]);
    expect(toast.warning).toHaveBeenCalledWith(
      "Schedule warnings cleared",
      expect.objectContaining({
        dedupeKey: "schedule-publish-availability-refreshed",
        description:
          "Publication is continuing with the latest conflict check.",
      }),
    );
  });
  it.each([
    { ...warnPreview, draft_revision: 4 },
    { ...warnPreview, locations: [{ ...preview.locations[0]!, active_version: 2 }] },
    { ...warnPreview, status: "hard_blocked" as const, findings: [...warnPreview.findings, publishFinding({ id: "time-off-00001", code: "time_off", severity: "hard", overrideable: false })] },
    { ...warnPreview, status: "override_required" as const, findings: [publishFinding({ id: "confirm-000001", availability_state: "new", warning_policy: "confirm", tier: "risk" })] },
  ])("does not auto-publish changed scope, baseline, blockers or confirm conflicts", async next => {
    const onPublish = vi.fn().mockRejectedValueOnce(staleError(next));
    await startPublication(onPublish);
    await screen.findByRole("dialog", { name: "Pre-flight check" });
    expect(onPublish).toHaveBeenCalledOnce(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("stops after one automatic retry if availability keeps changing", async () => {
    const changed = { ...warnPreview, fingerprint: "c".repeat(64), findings: [{ ...warnPreview.findings[0]!, id: "warn-finding-0002" }] };
    const onPublish = vi.fn().mockRejectedValueOnce(staleError(warnPreview)).mockRejectedValueOnce(staleError(changed));
    await startPublication(onPublish);
    await screen.findByRole("dialog", { name: "Pre-flight check" });
    expect(onPublish).toHaveBeenCalledTimes(2); expect(toast.warning).toHaveBeenCalledOnce();
  });
  it("does not retry an uncertain network failure", async () => {
    const onPublish = vi.fn().mockRejectedValueOnce(new Error("Connection lost"));
    await startPublication(onPublish);
    await screen.findByRole("dialog", { name: "Select locations to publish" });
    expect(onPublish).toHaveBeenCalledOnce(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("never retries after unmount or duplicates a pending publish click", async () => {
    let reject!: (error: unknown) => void;
    const onPublish = vi.fn().mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
    const h = await startPublication(onPublish);
    fireEvent.click(screen.getByRole("button", { name: /Publishing/ }));
    h.unmount();
    await act(async () => reject(staleError(warnPreview)));
    expect(onPublish).toHaveBeenCalledOnce(); expect(toast.warning).not.toHaveBeenCalled();
  });
  it("returns to a shift with publication choices and restores them against a fresh preview", async () => {
    const finding = publishFinding({ availability_state: "new", warning_policy: "confirm", tier: "risk" });
    const next = { ...preview, status: "override_required" as const, findings: [finding] };
    const choices: SchedulePublicationChoices = {
      draftId: draft.id, locationIds: [location.id], departmentKeys: [department.id],
    };
    const onReview = vi.fn().mockResolvedValue(undefined);
    const onPreview = vi.fn().mockResolvedValue(next);
    const onPublish = vi.fn().mockResolvedValue(undefined);
    const props = { drafts: [draft], activeDraftId: draft.id, locations: [location, patioLocation], departments: [department, backDepartment], employees: [employee], onClose: vi.fn(), onPreview, onPublish, onReviewShift: onReview };
    const first = render(<PublishScheduleDialog {...props} initialChoices={choices} />);
    fireEvent.click(await screen.findByRole("button", { name: "Show Alex Rivera's shift on 2026-08-17" }));
    await waitFor(() => expect(onReview).toHaveBeenCalledExactlyOnceWith(finding, choices));
    first.unmount();
    onPreview.mockResolvedValue({ ...next, fingerprint: "c".repeat(64) });
    render(<PublishScheduleDialog {...props} initialChoices={onReview.mock.calls[0]![1]} />);
    await screen.findByRole("dialog", { name: "Pre-flight check" });
    expect(onPreview).toHaveBeenLastCalledWith(draft.id, [location.id], { departmentIds: [department.id], includeNoDepartment: false });
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![2]).toMatchObject({ fingerprint: "c".repeat(64) });
  });

  it("keeps preflight open and retryable when the target draft cannot be opened", async () => {
    const next = { ...preview, findings: [publishFinding({ availability_state: "new", warning_policy: "warn", tier: "note" })] };
    const onReview = vi.fn().mockRejectedValue(new ScheduleRequestError("The draft is locked by another manager.", 409, {}));
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(next)} onPublish={vi.fn()} onReviewShift={onReview} />);
    await clickReadyNext();
    fireEvent.click(await screen.findByRole("button", { name: "Show Alex Rivera's shift on 2026-08-17" }));
    expect(await screen.findByText("The draft is locked by another manager.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Pre-flight check" })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "Show Alex Rivera's shift on 2026-08-17" })).toHaveProperty("disabled", false));
  });

  it.each(["warn", "confirm"] as const)("publishes new weekly %s findings without a written reason", async (policy) => {
    const finding = publishFinding({ availability_state: "new", warning_policy: policy, tier: policy === "warn" ? "note" : "risk" });
    const next = { ...preview, status: policy === "warn" ? "publish_ready" as const : "override_required" as const, findings: [finding] };
    const onPublish = vi.fn().mockResolvedValue({});
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(next)} onPublish={onPublish} />);
    await clickReadyNext();
    expect(await screen.findByText("Current schedule conflicts")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![1]).toEqual([{ finding_id: finding.id }]);
  });

  // M9: the employee's availability is listed for a last look; nothing is asked or recorded.
  it("lists availability as a note and publishes without a decision for it", async () => {
    const finding = publishFinding({ id: "d".repeat(64), code: "availability", overrideable: false, conflict_severity: "warn", tier: "note",
      message: "Alex Rivera shows as unavailable for this shift." });
    const next = { ...preview, status: "publish_ready" as const, findings: [finding] };
    const onPublish = vi.fn().mockResolvedValue({});
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(next)} onPublish={onPublish} />);
    await clickReadyNext();
    expect(await screen.findByText("1 person is scheduled while unavailable")).toBeTruthy();
    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "I've seen this warning and want to publish anyway" })).toBeNull();
    expect(screen.queryByText(/Acknowledged by/)).toBeNull();
    // The line above says it; the footer repeats nothing (BL-441).
    expect(screen.getByText("No blockers. One thing to glance at below.")).toBeTruthy();
    expect(document.querySelector(".schedule-publication-footer-summary")?.textContent).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![1]).toEqual([]);
  });

  it("does not reconfirm or resubmit previously accepted weekly findings", async () => {
    const next = { ...preview, findings: [publishFinding({ availability_state: "accepted", warning_policy: "confirm", tier: "note" })] };
    const onPublish = vi.fn().mockResolvedValue({});
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(next)} onPublish={onPublish} />);
    await clickReadyNext();
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]![1]).toEqual([]);
  });

  it("returns to one fresh confirmation when publication discovers changed weekly conflicts", async () => {
    const next = { ...preview, status: "override_required" as const, findings: [publishFinding({ availability_state: "new", warning_policy: "confirm", tier: "risk" })] };
    const changed = { ...next, fingerprint: "b".repeat(64), findings: [{ ...next.findings[0]!, id: "changed-000001" }] };
    const onPublish = vi.fn().mockRejectedValueOnce(new ScheduleRequestError("Review changed conflicts", 409, { status: "preflight", preflight: changed, preflight_block_reason: "stale_fingerprint" })).mockResolvedValue({});
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(next)} onPublish={onPublish} />);
    await clickReadyNext();
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await screen.findByRole("dialog", { name: "Pre-flight check" });
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(2));
    expect(onPublish.mock.calls[1]![2]).toMatchObject({ fingerprint: changed.fingerprint, decisions: [{ finding_id: "changed-000001" }] });
  });

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

  // BILDIRIM-02: notifications are gone (KARARLAR S-123); publishing ends on Pre-flight.
  it("previews and publishes selected locations in two steps", async () => {
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
    expect(
      [...document.querySelectorAll(".schedule-publication-steps > span")].map((step) => step.textContent),
    ).toEqual(["1Locations", "2Pre-flight"]);
    expect(screen.getByText("1 of 1 location selected")).toBeTruthy();
    await waitFor(() =>
      expect(onPreview).toHaveBeenCalledWith(draft.id, [location.id], {}),
    );
    // The preview's answer draws a step after the call (BL-1158: a busy runner checked in between).
    expect(await screen.findByText("Live · 2 shifts")).toBeTruthy();
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
    expect(document.querySelector(".schedule-publication-footer-summary")?.textContent).toBe("");
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByText(/notif/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish).toHaveBeenCalledWith(
      preview,
      [],
      {
        fingerprint: preview.fingerprint,
        decisions: [],
      },
      {},
    );
  });

  // Open shifts in the pool (Mert, 2026-10-20): one question for all the open shifts the publish
  // brings; offering them is the default.
  it("asks once what happens to the open shifts and publishes the choice", async () => {
    const openPreview: SchedulePublicationPreview = {
      ...preview,
      open_shifts: [
        { id: "81000000-0000-4000-8000-000000000001", location_id: location.id, location_name: location.name,
          job_id: "66666666-6666-4666-8666-666666666666", job_name: "Server", scheduled_date: "2026-08-20", start_time: "16:00", end_time: "22:00" },
        { id: "81000000-0000-4000-8000-000000000002", location_id: location.id, location_name: location.name,
          job_id: "66666666-6666-4666-8666-666666666666", job_name: "Host", scheduled_date: "2026-08-21", start_time: "09:00", end_time: "15:00" },
      ],
    };
    const onPublish = vi.fn().mockResolvedValue(undefined);
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()}
      onPreview={vi.fn().mockResolvedValue(openPreview)} onPublish={onPublish} />);
    await clickReadyNext();
    const group = await screen.findByRole("group", { name: "2 open shifts: what happens when you publish?" });
    expect(within(group).getByText("Thu, Aug 20 · 4p–10p · Server · Main Dining")).toBeTruthy();
    expect(within(group).getByText("Fri, Aug 21 · 9a–3p · Host · Main Dining")).toBeTruthy();
    const offer = within(group).getByRole("radio", { name: /Offer to eligible employees/ }) as HTMLInputElement;
    expect(offer.checked).toBe(true);
    expect(within(group).getByRole("radio", { name: /Keep as open shifts/ })).toBeTruthy();
    fireEvent.click(within(group).getByRole("radio", { name: /Delete them/ }));
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish.mock.calls[0]?.[4]).toBe("delete");
  });

  it("asks nothing about open shifts when the publish brings none", async () => {
    const onPublish = vi.fn().mockResolvedValue(undefined);
    await startPublication(onPublish);
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("group", { name: /open shift/ })).toBeNull();
    expect(onPublish.mock.calls[0]).toHaveLength(4);
  });

  it("says who published or unpublished a location after the draft was started", async () => {
    const at = "2026-08-18T14:05:00Z";
    const when = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(at));
    const changed: SchedulePublicationPreview = {
      ...preview,
      locations: [
        {
          ...preview.locations[0]!,
          changed_since_start: { kind: "published", by_name: "Mehmet B", at },
        },
        {
          ...preview.locations[0]!,
          location_id: patioLocation.id,
          location_name: patioLocation.name,
          changed_since_start: { kind: "unpublished", by_name: "Zeynep A", at },
        },
      ],
    };

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location, patioLocation]}
        employees={[employee]}
        onClose={vi.fn()}
        onPreview={vi.fn().mockResolvedValue(changed)}
        onPublish={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        `Mehmet B published this location on ${when}, after this draft was started. Publishing replaces that version.`,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        `Zeynep A unpublished this location on ${when}, after this draft was started. Publishing makes it live again.`,
      ),
    ).toBeTruthy();
    // A warning, not a blocker: the publisher decides.
    await clickReadyNext();
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
      await screen.findByRole("heading", { name: "We couldn't load the publish preview" }),
    ).toBeTruthy();
    expect(screen.queryByText("preview failed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => expect(onPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Live · 2 shifts")).toBeTruthy();
  });

  // BL-299: a new choice drops the last preview, so a failed preview is never shown over an old one.
  it("drops the last preview on a new choice and says plainly when the next one fails", async () => {
    const onPreview = vi
      .fn()
      .mockResolvedValueOnce(preview)
      .mockRejectedValueOnce(new Error("relation x does not exist"))
      .mockResolvedValue(preview);

    render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        departments={[department, backDepartment]}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={vi.fn()}
      />,
    );

    expect(await screen.findByText("Live · 2 shifts")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Back of House"));

    expect(
      await screen.findByRole("heading", { name: "We couldn't load the publish preview" }),
    ).toBeTruthy();
    expect(screen.queryByText("Live · 2 shifts")).toBeNull();
    expect(screen.queryByText(/does not exist/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Live · 2 shifts")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "We couldn't load the publish preview" }),
    ).toBeNull();
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
    fireEvent.click(await screen.findByRole("button", { name: "Publish 1 location" }));

    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));
    expect(onPublish).toHaveBeenCalledWith(
      preview,
      [],
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

  it("continues from the recap without a reason form or extra checkbox", async () => {
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
      name: "Publish 1 location",
    });
    expect(screen.queryByRole("textbox", { name: "Reason" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(proceed).toHaveProperty("disabled", false);
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
      screen.getByRole("button", { name: "Publish 1 location" }),
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
    expect(screen.getByText("1 conflict must be fixed")).toBeTruthy();
  });

  it("opens document conflicts for review without clearing publish state", async () => {
    const onPreview = vi.fn().mockResolvedValue(preview);
    const onReviewDocumentConflict = vi.fn();
    const documentConflict = {
      employee_id: employee.id,
      employee_name: employee.display_name,
      shift_id: "77777777-7777-4777-8777-777777777777",
      location_id: location.id,
      location_name: location.name,
      date: "2026-08-17",
      start_time: "16:00",
      end_time: "19:00",
      document_type_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      requirement_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      document_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      document_title: "Food handler card",
      expiry_date: "2026-08-01",
      expiry_policy_version: 2,
      pending_document_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      review_action: "review_document",
      severity: "hard",
      overrideable: false,
      warning_text: "Food handler card is expired and blocks scheduling.",
    } as const;
    const onPublish = vi.fn().mockRejectedValue(
      new ScheduleRequestError("schedule conflicts", 409, {
        status: "schedule_conflicts",
        schedule_conflicts: [documentConflict],
      }),
    );

    const view = render(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        documentReviewVersion={0}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
        onReviewDocumentConflict={onReviewDocumentConflict}
      />,
    );

    await clickReadyNext();
    await waitFor(() =>
      expect(screen.getAllByText("Ready to publish").length).toBeGreaterThan(0),
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish 1 location" }));

    expect(
      await screen.findByText(
        "Alex Rivera: 2026-08-17, Food handler card is expired and blocks scheduling.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review document" }));

    expect(onReviewDocumentConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "document_expiry",
        employee_id: employee.id,
        requirement_id: documentConflict.requirement_id,
      }),
    );
    expect(screen.getByText("1 conflict must be fixed")).toBeTruthy();

    view.rerender(
      <PublishScheduleDialog
        drafts={[draft]}
        locations={[location]}
        employees={[employee]}
        documentReviewVersion={1}
        onClose={vi.fn()}
        onPreview={onPreview}
        onPublish={onPublish}
        onReviewDocumentConflict={onReviewDocumentConflict}
      />,
    );
    await waitFor(() =>
      expect(screen.queryByText("1 conflict must be fixed")).toBeNull(),
    );
    expect(onPreview).toHaveBeenLastCalledWith(draft.id, [location.id], {});
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
          changed_since_start: null,
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

  it("names a single live shift in the singular when it is the only one removed (BL-311)", async () => {
    const onePreview: SchedulePublicationPreview = {
      ...preview,
      locations: [{ ...preview.locations[0]!, active_publication_id: "66666666-6666-4666-8666-666666666666", active_version: 2, current_shift_count: 1, next_shift_count: 0, added: 0, updated: 0, removed: 1, unchanged: 0, affected_employee_ids: [] }],
    };
    render(<PublishScheduleDialog drafts={[draft]} locations={[location]} employees={[employee]} onClose={vi.fn()} onPreview={vi.fn().mockResolvedValue(onePreview)} onPublish={vi.fn()} />);

    expect(await screen.findByText("The only live shift at this location will be removed.")).toBeTruthy();
  });
});
