import { z } from "zod";

// BILDIRIM-10: the list's page cursor is opaque outside the API. It names the
// last row shown (its time and id), so a change in how the core pages (the
// id beside the time, BILDIRIM-12) is a change here only, never in the contract.

export interface NotificationCursor {
  readonly at: string;
  readonly id: string;
}

const cursorPayload = z.object({ t: z.string().datetime({ offset: true }), i: z.string().uuid() }).strict();

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.at, i: cursor.id }), "utf8").toString("base64url");
}

/** The cursor the API gave, or null for anything else (the route answers 400). */
export function decodeNotificationCursor(text: string): NotificationCursor | null {
  try {
    const parsed = cursorPayload.safeParse(JSON.parse(Buffer.from(text, "base64url").toString("utf8")));
    return parsed.success ? { at: parsed.data.t, id: parsed.data.i } : null;
  } catch {
    return null;
  }
}
