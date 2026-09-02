import { describe, expect, it } from "vitest";

import {
  createScheduleDebugOperationId,
  resetScheduleDebugOperationIdsForTest,
} from "./scheduleDebug";

describe("schedule debug operation ids", () => {
  it("keeps the reference schedule operation id format", () => {
    resetScheduleDebugOperationIdsForTest();

    expect(createScheduleDebugOperationId()).toBe("schedule-op-1");
    expect(createScheduleDebugOperationId()).toBe("schedule-op-2");
  });
});
