import { describe, expect, it } from "vitest";

import { scheduleClosureCoversDate, scheduleClosureLabel } from "./scheduleClosures";

describe("scheduleClosures", () => {
  it("covers only the closure's own day", () => {
    expect(scheduleClosureCoversDate({ closed_date: "2026-08-17" }, "2026-08-17")).toBe(true);
    expect(scheduleClosureCoversDate({ closed_date: "2026-08-17" }, "2026-08-18")).toBe(false);
  });

  it("names a Closed day and Short hours (EKRAN-08)", () => {
    expect(scheduleClosureLabel({ kind: "closed", opens: null, closes: null })).toEqual({
      text: "Closed",
      hours: null,
    });
    expect(scheduleClosureLabel({ kind: "short", opens: "10:00", closes: "15:30" })).toEqual({
      text: "Short hours 10a–3:30p",
      hours: "10a–3:30p",
    });
    expect(scheduleClosureLabel({ kind: "short", opens: "17:00", closes: "02:00" }, "24h").text).toBe(
      "Short hours 17:00–02:00",
    );
  });
});
