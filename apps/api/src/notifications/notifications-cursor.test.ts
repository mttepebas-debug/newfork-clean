import { describe, expect, it } from "vitest";
import { notificationCursorSchema } from "@newfork/shared";
import { decodeNotificationCursor, encodeNotificationCursor } from "./notifications-cursor";

const last = { at: "2026-10-16T16:38:10.2327+00:00", id: "13253395-6150-43b9-bb13-364014baae15" };

describe("notification cursor", () => {
  it("names the last row by its time and id, and reads back the same", () => {
    const cursor = encodeNotificationCursor(last);
    expect(notificationCursorSchema.safeParse(cursor).success).toBe(true);
    expect(decodeNotificationCursor(cursor)).toEqual(last);
  });

  it("reads nothing else", () => {
    const forged = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(decodeNotificationCursor("not-a-cursor")).toBeNull();
    expect(decodeNotificationCursor(forged({ t: "yesterday", i: last.id }))).toBeNull();
    expect(decodeNotificationCursor(forged({ t: last.at, i: "x" }))).toBeNull();
    expect(decodeNotificationCursor(forged({ t: last.at, i: last.id, extra: 1 }))).toBeNull();
  });
});
