import { describe, expect, it } from "vitest";

import { isSameEditSession } from "./scheduleMutationContext";

const started = {
  userId: "user-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
  revision: 4,
};

describe("isSameEditSession (BL-323)", () => {
  it("drops a result whose edit session was discarded meanwhile", () => {
    expect(
      isSameEditSession(started, {
        ...started,
        sessionId: undefined,
        revision: undefined,
      }),
    ).toBe(false);
    expect(isSameEditSession(started, null)).toBe(false);
  });

  it("drops a result from another workspace, user or session", () => {
    expect(isSameEditSession(started, { ...started, workspaceId: "workspace-2" })).toBe(false);
    expect(isSameEditSession(started, { ...started, userId: "user-2" })).toBe(false);
    expect(isSameEditSession(started, { ...started, sessionId: "session-2" })).toBe(false);
  });

  it("keeps a result when only the revision moved (a second edit landed first)", () => {
    expect(isSameEditSession(started, { ...started, revision: 5 })).toBe(true);
  });
});
