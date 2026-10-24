import { describe, expect, it } from "vitest";
import {
  notificationAreaSchema,
  notificationFeedQuerySchema,
  notificationItemSchema,
  notificationReadInputSchema,
  notificationUnreadInputSchema,
} from "./notifications";

// The core's own answer (get_notification_feed_service, rolled-back local run,
// BILDIRIM-10): Postgres keeps as many fraction digits as it has.
const fromCore = {
  id: "13253395-6150-43b9-bb13-364014baae15",
  url: "/app/schedule/requests?tab=time-off&request=98020000-0000-4000-8000-000000000001",
  area: "time_off",
  body: "Wed, Oct 21 · Jury duty summons.",
  data: { request_id: "98020000-0000-4000-8000-000000000001", request_type: "time_off" },
  type: "time_off.requested",
  level: "important",
  title: "Time off request from Tom Becker",
  topic: "approvals",
  read_at: null,
  seen_at: null,
  created_at: "2026-10-16T16:38:10.2327+00:00",
  resolution: null,
  subject_id: "98020000-0000-4000-8000-000000000001",
  resolved_at: null,
  resolved_by: null,
  needs_action: true,
  subject_type: "time_off_request",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  actor_user_id: null,
};

describe("notificationItemSchema", () => {
  it("reads a row as the core writes it", () => {
    expect(notificationItemSchema.parse(fromCore)).toEqual(fromCore);
  });

  it("reads an account notice, which names no workspace", () => {
    expect(notificationItemSchema.parse({ ...fromCore, workspace_id: null }).workspace_id).toBeNull();
  });

  it("refuses a link to another site", () => {
    expect(notificationItemSchema.safeParse({ ...fromCore, url: "//evil.example" }).success).toBe(false);
    expect(notificationItemSchema.safeParse({ ...fromCore, url: "https://evil.example" }).success).toBe(false);
  });
});

describe("notificationReadInputSchema", () => {
  it("refuses a link with a control character, as the table does (BILDIRIM-14)", () => {
    for (const url of ["/app\nx", "/app\tx", "/\u0000"]) {
      expect(notificationItemSchema.safeParse({ ...fromCore, url }).success).toBe(false);
    }
  });

  it("takes ids or all, never an empty body", () => {
    expect(notificationReadInputSchema.safeParse({ ids: [fromCore.id] }).success).toBe(true);
    expect(notificationReadInputSchema.safeParse({ all: true }).success).toBe(true);
    expect(notificationReadInputSchema.safeParse({}).success).toBe(false);
    expect(notificationReadInputSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(notificationReadInputSchema.safeParse({ all: false }).success).toBe(false);
  });
});

describe("notificationUnreadInputSchema", () => {
  // S-251: a read row turns unread again by its id; there is no "mark all as unread".
  it("takes 1 to 100 ids and nothing else", () => {
    expect(notificationUnreadInputSchema.parse({ ids: [fromCore.id] })).toEqual({ ids: [fromCore.id] });
    expect(notificationUnreadInputSchema.safeParse({ ids: Array.from({ length: 100 }, () => fromCore.id) }).success).toBe(true);
    expect(notificationUnreadInputSchema.safeParse({ ids: Array.from({ length: 101 }, () => fromCore.id) }).success).toBe(false);
    expect(notificationUnreadInputSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(notificationUnreadInputSchema.safeParse({ ids: ["not-a-uuid"] }).success).toBe(false);
    expect(notificationUnreadInputSchema.safeParse({}).success).toBe(false);
    expect(notificationUnreadInputSchema.safeParse({ all: true }).success).toBe(false);
    expect(notificationUnreadInputSchema.safeParse({ ids: [fromCore.id], all: true }).success).toBe(false);
  });
});

describe("notificationFeedQuerySchema", () => {
  it("defaults to the first page of everything", () => {
    expect(notificationFeedQuerySchema.parse({})).toEqual({ filter: "all", limit: 30 });
  });

  it("keeps an opaque cursor as it came and refuses anything else", () => {
    expect(notificationFeedQuerySchema.parse({ before: "eyJ0IjoiMjAyNi0xMC0xNiJ9", limit: "5" })).toMatchObject({ before: "eyJ0IjoiMjAyNi0xMC0xNiJ9", limit: 5 });
    expect(notificationFeedQuerySchema.safeParse({ before: "2026-10-16T16:38:10+00:00" }).success).toBe(false);
    expect(notificationFeedQuerySchema.safeParse({ before: "" }).success).toBe(false);
    expect(notificationFeedQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("notification areas", () => {
  // KARARLAR S-133 (BILDIRIM-U7): availability raises no notification, so no notice is filed under it.
  it("has no availability area", () => {
    expect(notificationAreaSchema.options).not.toContain("availability");
  });
});
