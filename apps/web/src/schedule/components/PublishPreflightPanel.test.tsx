import { fireEvent, render, screen } from "@testing-library/react";
import type { SchedulePublicationPreview } from "@newfork/shared/schedule";
import { describe, expect, it, vi } from "vitest";
import {
  PublishPreflightPanel,
  publishGatingRisks,
  publishInformationalFindings,
  publishHardBlockers,
  publishOverrideableBlockers,
} from "./PublishPreflightPanel";

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

describe("PublishPreflightPanel", () => {
  it("separates new weekly conflicts from collapsed accepted conflicts without reason inputs", () => {
    const fresh = { ...preview.findings[0]!, availability_state: "new" as const, warning_policy: "confirm" as const, tier: "risk" as const, employee_name: "Alex" };
    const accepted = { ...fresh, id: "accepted-00001", availability_state: "accepted" as const, tier: "note" as const, employee_name: "Taylor" };
    const next = { ...preview, findings: [fresh, accepted] };
    expect(publishHardBlockers(next)).toEqual([]);
    expect(publishOverrideableBlockers(next)).toEqual([]);
    expect(publishGatingRisks(next)).toEqual([]);
    expect(publishInformationalFindings(next)).toEqual([]);
    const review = vi.fn();
    render(<PublishPreflightPanel preview={next} locations={[]} overrideReasons={{}} onOverrideReasonChange={vi.fn()} onReviewShift={review} />);
    expect(screen.getByText("New availability conflicts")).toBeTruthy();
    const disclosure = screen.getByText("Previously accepted (1)").closest("details");
    expect(disclosure).toHaveProperty("open", false);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show Alex's shift on 2026-08-17" }));
    expect(review).toHaveBeenCalledExactlyOnceWith(fresh);
  });

  it("never treats a hard finding as a weekly acknowledgement", () => {
    const hard = { ...preview.findings[0]!, severity: "hard" as const, availability_state: "accepted" as const, warning_policy: "warn" as const };
    expect(publishHardBlockers({ ...preview, findings: [hard] })).toEqual([hard]);
  });

  it("groups overrideable blockers with audit reason input", () => {
    const onReason = vi.fn();

    render(
      <PublishPreflightPanel
        preview={preview}
        locations={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main Dining",
            timezone: "America/Los_Angeles",
            sort_order: 1,
            publication_status: "published",
            published_at: null,
          },
        ]}
        overrideReasons={{}}
        onOverrideReasonChange={onReason}
      />,
    );

    expect(screen.getByText("1 blocker")).toBeTruthy();
    expect(screen.getByText("Blockers — override with a reason")).toBeTruthy();
    expect(screen.getByText("Alex is outside availability.")).toBeTruthy();
    expect(screen.getByText("2026-08-17 · Main Dining")).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox", { name: "Reason" }), {
      target: { value: "Manager approved coverage." },
    });

    expect(onReason).toHaveBeenCalledWith(
      "soft-finding-1",
      "Manager approved coverage.",
    );
  });

  it("shows clear ready state when no findings exist", () => {
    render(
      <PublishPreflightPanel
        preview={{ ...preview, status: "publish_ready", findings: [] }}
        locations={[]}
        overrideReasons={{}}
        onOverrideReasonChange={vi.fn()}
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
        overrideReasons={{}}
        onOverrideReasonChange={vi.fn()}
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

    render(
      <PublishPreflightPanel
        preview={nextPreview}
        locations={[
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main Dining",
            timezone: "America/Los_Angeles",
            sort_order: 1,
            publication_status: "published",
            published_at: null,
          },
        ]}
        overrideReasons={{}}
        onOverrideReasonChange={vi.fn()}
      />,
    );

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
