import { describe, expect, it } from "vitest";
import {
  formatCascadeNoticeToast,
  type CascadeNoticePayload,
} from "./CascadeNoticeToast";

describe("formatCascadeNoticeToast", () => {
  it("formats stripped job notices", () => {
    const notice: CascadeNoticePayload = {
      kind: "cascade_notice",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      deleted_resource: {
        type: "job",
        ids: ["00000000-0000-0000-0000-000000000002"],
        name: "Server",
      },
      affected_op_ids: ["00000000-0000-0000-0000-000000000003"],
      affected_action: "stripped",
    };

    expect(formatCascadeNoticeToast(notice)).toBe(
      '1 pending edit adjusted after Admin changed job "Server".',
    );
  });

  it("names the actor when one is resolved", () => {
    const notice: CascadeNoticePayload = {
      kind: "cascade_notice",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      deleted_resource: {
        type: "job",
        ids: ["00000000-0000-0000-0000-000000000002"],
        name: "Server",
      },
      affected_op_ids: ["00000000-0000-0000-0000-000000000003"],
      affected_action: "stripped",
    };

    expect(formatCascadeNoticeToast(notice, "Mina Yilmaz")).toBe(
      '1 pending edit adjusted after Mina Yilmaz changed job "Server".',
    );
  });

  it("falls back to the generic actor label for a blank name", () => {
    const notice: CascadeNoticePayload = {
      kind: "cascade_notice",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      deleted_resource: {
        type: "job",
        ids: ["00000000-0000-0000-0000-000000000002"],
        name: "Server",
      },
      affected_op_ids: ["00000000-0000-0000-0000-000000000003"],
      affected_action: "deleted",
    };

    expect(formatCascadeNoticeToast(notice, "   ")).toBe(
      '1 pending edit removed after Admin changed job "Server".',
    );
  });

  it("formats mixed shift-type notices", () => {
    const notice: CascadeNoticePayload = {
      kind: "cascade_notice",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      deleted_resource: {
        type: "shift_type",
        ids: ["00000000-0000-0000-0000-000000000002"],
        name: "Close",
      },
      affected_op_ids: [
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
      ],
      affected_action: "mixed",
    };

    expect(formatCascadeNoticeToast(notice)).toBe(
      '2 pending edits updated after Admin changed shift type "Close".',
    );
  });
});
