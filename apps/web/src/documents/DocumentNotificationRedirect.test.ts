import { describe, expect, it } from "vitest";
import { documentNotificationDestination } from "./DocumentNotificationRedirect";
describe("document notification redirect", () => {
  it("copies only scoped identifiers and known document kind", () => {
    expect(
      documentNotificationDestination(
        new URLSearchParams(
          "workspace=25200000-0000-4000-8000-000000000001&requirement=65200000-0000-4000-8000-000000000001&kind=acknowledgement&redirect=https://example.com",
        ),
      ),
    ).toBe(
      "/account/documents?workspace=25200000-0000-4000-8000-000000000001&requirement=65200000-0000-4000-8000-000000000001&kind=acknowledgement",
    );
    expect(
      documentNotificationDestination(
        new URLSearchParams(
          "workspace=wrong&requirement=../../other&kind=unknown&next=/app",
        ),
      ),
    ).toBe("/account/documents");
  });
});
