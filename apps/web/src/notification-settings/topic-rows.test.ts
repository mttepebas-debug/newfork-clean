import type { NotificationTopicPreference } from "@newfork/shared";
import { describe, expect, it } from "vitest";
import { rowState, topicRows } from "./topic-rows";

function topic(key: string, level: "important" | "optional" = "important"): NotificationTopicPreference {
  return {
    key,
    name: key,
    level,
    description: `About ${key}`,
    email: { choice: null, default: true },
    push: { choice: null, default: true },
  };
}

describe("Account > Notifications rows", () => {
  it("puts shift changes and time off together as My requests, where the first of them stood", () => {
    const rows = topicRows([topic("my_schedule"), topic("open_shifts", "optional"), topic("shift_changes"), topic("time_off"), topic("documents")]);
    expect(rows.map((row) => row.key)).toEqual(["my_schedule", "open_shifts", "my_requests", "documents"]);
    const requests = rows[2]!;
    expect(requests.name).toBe("My requests");
    expect(requests.topics.map((part) => part.key)).toEqual(["shift_changes", "time_off"]);
    expect(requests.description).toBe("About shift_changes About time_off");
  });

  it("keeps every other topic its own row, with its level and description", () => {
    const rows = topicRows([topic("approvals"), topic("team", "optional")]);
    expect(rows).toEqual([
      { key: "approvals", name: "approvals", level: "important", description: "About approvals", topics: [expect.objectContaining({ key: "approvals" })] },
      { key: "team", name: "team", level: "optional", description: "About team", topics: [expect.objectContaining({ key: "team" })] },
    ]);
  });

  it("makes My requests important when either part is", () => {
    expect(topicRows([topic("time_off", "optional"), topic("shift_changes")])[0]!.level).toBe("important");
    expect(topicRows([topic("time_off", "optional"), topic("shift_changes", "optional")])[0]!.level).toBe("optional");
  });

  it("leaves a lone part as its own topic", () => {
    const rows = topicRows([topic("time_off")]);
    expect(rows.map((row) => [row.key, row.name])).toEqual([["time_off", "time_off"]]);
  });

  it("ticks a row when every topic in it is on and marks it mixed when only some are", () => {
    expect(rowState([true, true])).toEqual({ checked: true, mixed: false });
    expect(rowState([true, false])).toEqual({ checked: false, mixed: true });
    expect(rowState([false, false])).toEqual({ checked: false, mixed: false });
    expect(rowState([true])).toEqual({ checked: true, mixed: false });
  });
});
