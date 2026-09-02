import type { ScheduleReadModel } from "@newfork/shared/schedule";
import { describe, expect, it } from "vitest";

import { scheduleClosureCoversDate } from "./scheduleClosures";

const closure = {
  closed_date: "2026-08-17",
  end_date: "2026-08-19",
} as ScheduleReadModel["closures"][number];

describe("scheduleClosures", () => {
  it("matches dates inside an inclusive closure range", () => {
    expect(scheduleClosureCoversDate(closure, "2026-08-17")).toBe(true);
    expect(scheduleClosureCoversDate(closure, "2026-08-18")).toBe(true);
    expect(scheduleClosureCoversDate(closure, "2026-08-19")).toBe(true);
    expect(scheduleClosureCoversDate(closure, "2026-08-20")).toBe(false);
  });

  it("uses closed date when end date is missing", () => {
    expect(
      scheduleClosureCoversDate(
        { ...closure, end_date: null },
        "2026-08-17",
      ),
    ).toBe(true);
    expect(
      scheduleClosureCoversDate(
        { ...closure, end_date: null },
        "2026-08-18",
      ),
    ).toBe(false);
  });
});
