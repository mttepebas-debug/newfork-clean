import { fireEvent, render, screen } from "@testing-library/react";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { describe, expect, it, vi } from "vitest";
import {
  PublishPreflightPanel,
  publishGatingRisks,
  publishInformationalFindings,
  publishHardBlockers,
  publishNewAvailabilityWarnings,
  publishOverrideableBlockers,
} from "./PublishPreflightPanel";

const mainDining = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Main Dining",
  timezone: "America/Los_Angeles",
  sort_order: 1,
  publication_status: "published" as const,
  published_at: null,
};

const preview: SchedulePublicationPreview = {
  status: "override_required",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  week_start: "2026-08-17",
  draft_id: "22222222-2222-4222-8222-222222222222",
  draft_revision: 1,
  fingerprint: "a".repeat(64),
  locations: [],
  findings: [
    {
      id: "soft-finding-1",
      code: "availability",
      severity: "soft",
      overrideable: true,
      message: "Alex is outside availability.",
      location_id: "33333333-3333-4333-8333-333333333333",
      employee_id: null,
      scheduled_date: "2026-08-17",
      shift_ids: ["44444444-4444-4444-8444-444444444444"],
    },
  ],
};

// What the database sends for "Ali shows as unavailable" (BL-186).
const availabilityWarning = {
  ...preview.findings[0]!,
  id: "availability-00001",
  code: "availability" as const,
  availability_state: "new" as const,
  warning_policy: "confirm" as const,
  tier: "risk" as const,
  employee_name: "Ali Kaya",
  message: "Ali Kaya shows as unavailable for this shift.",
};

describe("PublishPreflightPanel", () => {
  it("shows time off waiting for a decision as a note that does not stop publishing (FB-6.3.6)", () => {
    const pendingTimeOff = {
      ...preview.findings[0]!, id: "time_off_pending:0001", code: "time_off_pending" as const, overrideable: false, tier: "note" as const,
      employee_name: "Ali Kaya", message: "Ali Kaya has time off waiting for a decision on Aug 17",
      time_off_request_id: "55555555-5555-4555-8555-555555555555",
    };
    const ready = { ...preview, status: "publish_ready" as const, findings: [pendingTimeOff] };
    expect(publishHardBlockers(ready)).toEqual([]);
    expect(publishGatingRisks(ready)).toEqual([]);
    render(<PublishPreflightPanel preview={ready} locations={[mainDining]} />);
    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect(screen.getByText("Notes and already-live issues")).toBeTruthy();
    expect(screen.getByText("Ali Kaya has time off waiting for a decision on Aug 17")).toBeTruthy();
  });
  it("separates new weekly conflicts from collapsed accepted conflicts without reason inputs", () => {
    const fresh = { ...preview.findings[0]!, code: "schedule_conflict" as const, availability_state: "new" as const, warning_policy: "confirm" as const, tier: "risk" as const, employee_name: "Alex" };
    const accepted = { ...fresh, id: "accepted-00001", availability_state: "accepted" as const, tier: "note" as const, employee_name: "Taylor" };
    const next = { ...preview, findings: [fresh, accepted] };
    expect(publishHardBlockers(next)).toEqual([]);
    expect(publishOverrideableBlockers(next)).toEqual([]);
    expect(publishGatingRisks(next)).toEqual([]);
    expect(publishInformationalFindings(next)).toEqual([]);
    const review = vi.fn();
    render(<PublishPreflightPanel preview={next} locations={[]} onReviewShift={review} />);
    expect(screen.getByText("Current schedule conflicts")).toBeTruthy();
    const disclosure = screen.getByText("Previously accepted (1)").closest("details");
    expect(disclosure).toHaveProperty("open", false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Alex's shift on 2026-08-17" }));
    expect(review).toHaveBeenCalledExactlyOnceWith(fresh);
  });

  it("lists a new availability warning with an explicit confirmation (BL-186)", () => {
    const next = { ...preview, findings: [availabilityWarning] };
    expect(publishNewAvailabilityWarnings(next)).toEqual([availabilityWarning]);
    const onAcknowledge = vi.fn();
    const view = render(
      <PublishPreflightPanel preview={next} locations={[mainDining]}
        availabilityAcknowledged={false} onAvailabilityAcknowledgedChange={onAcknowledge} />,
    );
    expect(screen.getByText("1 availability warning")).toBeTruthy();
    expect(screen.getByText("Availability")).toBeTruthy();
    expect(screen.getByText("Ali Kaya shows as unavailable for this shift.")).toBeTruthy();
    expect(screen.queryByText(/schedule conflict/)).toBeNull();
    const confirm = screen.getByRole("checkbox", { name: "I've seen this warning and want to publish anyway" });
    expect(confirm).toHaveProperty("checked", false);
    fireEvent.click(confirm);
    expect(onAcknowledge).toHaveBeenCalledExactlyOnceWith(true);
    view.rerender(
      <PublishPreflightPanel preview={{ ...next, findings: [availabilityWarning, { ...availabilityWarning, id: "availability-00002" }] }}
        locations={[mainDining]} availabilityAcknowledged onAvailabilityAcknowledgedChange={onAcknowledge} />,
    );
    expect(screen.getByRole("checkbox", { name: "I've seen these 2 warnings and want to publish anyway" })).toHaveProperty("checked", true);
  });

  it("never treats a hard finding as a weekly acknowledgement", () => {
    const hard = { ...preview.findings[0]!, severity: "hard" as const, availability_state: "accepted" as const, warning_policy: "warn" as const };
    expect(publishHardBlockers({ ...preview, findings: [hard] })).toEqual([hard]);
  });

  it("summarizes warnings without a reason input", () => {
    render(<PublishPreflightPanel preview={preview} locations={[mainDining]} />);

    expect(screen.getByText("1 blocker")).toBeTruthy();
    expect(screen.getByText("Warnings to review")).toBeTruthy();
    expect(screen.getByText("Alex is outside availability.")).toBeTruthy();
    expect(screen.getByText("2026-08-17 · Main Dining")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows clear ready state when no findings exist", () => {
    render(
      <PublishPreflightPanel
        preview={{ ...preview, status: "publish_ready", findings: [] }}
        locations={[]}
      />,
    );

    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect(
      screen.getByText(
        "Nothing in this week's changes needs attention before it goes live.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("No publication blockers found.")).toBeNull();
  });

  it("uses the reference stale-preflight refresh copy", () => {
    render(
      <PublishPreflightPanel
        preview={preview}
        locations={[]}
        blockReason="stale_fingerprint"
      />,
    );

    expect(
      screen.getByText(
        "The schedule changed while this dialog was open. The findings below are refreshed — review them again.",
      ),
    ).toBeTruthy();
  });

  it("keeps already-live overrideable risks informational like the reference publish flow", () => {
    const alreadyLiveRisk = {
      ...preview.findings[0]!,
      id: "risk-already-live-1",
      severity: "soft" as const,
      overrideable: true,
      tier: "risk" as const,
      introduced: false,
      projected: false,
      fix_hint: "Reassign the shift, or ask the employee to update availability.",
      message: "Alex is outside availability, but this issue is already live.",
    };
    const nextPreview = {
      ...preview,
      status: "publish_ready" as const,
      findings: [alreadyLiveRisk],
    };

    expect(publishGatingRisks(nextPreview)).toEqual([]);
    expect(publishInformationalFindings(nextPreview)).toEqual([
      alreadyLiveRisk,
    ]);

    render(<PublishPreflightPanel preview={nextPreview} locations={[mainDining]} />);

    expect(screen.getByText("Ready to publish")).toBeTruthy();
    expect(screen.getByText("Notes and already-live issues")).toBeTruthy();
    expect(
      screen.getByText(
        "These do not stop this publish — they either pre-date it or are informational.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Alex is outside availability, but this issue is already live.",
      ),
    ).toBeTruthy();
  });
});

describe("PublishPreflightPanel availability hours (G14)", () => {
  it("adds the hours the Schedule already holds to the warning line, with the orange mark", () => {
    const aliId = "66666666-6666-4666-8666-666666666666";
    const after2 = { start_at: "2026-08-17T21:00:00Z", end_at: "2026-08-18T07:00:00Z" };
    const ali = {
      id: aliId,
      weekly_availability: [{
        location_id: mainDining.id, location_name: "Main Dining", timezone: "America/Los_Angeles", week_start: "2026-08-17",
        status: "ready", unavailable_intervals: [after2], employee_intervals: [after2], leave_intervals: [],
        clock_segments: [{ start_at: "2026-08-17T07:00:00Z", end_at: "2026-08-25T07:00:00Z", offset_seconds: -7 * 3600 }],
        days: ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"]
          .map((date) => ({ date, has_unavailable: date === "2026-08-17", all_day: false })),
      }],
    } as unknown as NonNullable<Parameters<typeof PublishPreflightPanel>[0]["employees"]>[number];
    render(
      <PublishPreflightPanel
        preview={{ ...preview, findings: [{ ...availabilityWarning, employee_id: aliId }] }}
        locations={[mainDining]}
        employees={[ali]}
      />,
    );
    expect(screen.getByText("Ali Kaya shows as unavailable for this shift. (unavailable after 2:00 PM)")).toBeTruthy();
    expect(document.querySelectorAll(".schedule-publish-weekly-availability .schedule-availability-tip-dot")).toHaveLength(2);
  });
});
