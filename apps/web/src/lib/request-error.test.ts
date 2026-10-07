import { describe, expect, it } from "vitest";

import { RequestError, requestErrorText } from "./request-error";

// A request error of the Schedule's own shape: a sentence and a numeric status.
class StatusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

describe("requestErrorText (G11, BL-395)", () => {
  it("shows the API's own sentence for a refusal", () => {
    expect(requestErrorText(new StatusError("This week is closed for edits.", 409))).toBe(
      "This week is closed for edits.",
    );
    expect(requestErrorText(new RequestError("Choose a location you manage.", "authz.out_of_scope", undefined, 403))).toBe(
      "Choose a location you manage.",
    );
  });

  it("shows a sentence the app wrote for a refusal it knows by key, even without a status (BL-218)", () => {
    expect(requestErrorText(new RequestError("The Owner job cannot be archived.", "management.owner_job"))).toBe(
      "The Owner job cannot be archived.",
    );
    expect(requestErrorText(new RequestError("duplicate key value violates unique constraint"))).toBe(
      "Newfork could not finish that. Try again in a moment.",
    );
  });

  it("never shows a server failure, a dropped connection or a parser's words", () => {
    const plain = "Newfork could not finish that. Try again in a moment.";
    expect(requestErrorText(new StatusError("Internal server error", 500))).toBe(plain);
    expect(requestErrorText(new StatusError("anything", 0))).toBe(
      "Newfork could not be reached. Check your connection and try again.",
    );
    expect(requestErrorText(new Error('[{"code":"invalid_type","path":["shifts"]}]'))).toBe(plain);
    expect(requestErrorText(new TypeError("Failed to fetch"))).toBe(plain);
    expect(requestErrorText("boom")).toBe(plain);
  });

  it("uses the caller's sentence when the failure says nothing a person can use", () => {
    expect(requestErrorText(new Error("boom"), "The draft could not be deleted.")).toBe("The draft could not be deleted.");
    expect(requestErrorText(new StatusError("", 409), "The draft could not be deleted.")).toBe(
      "The draft could not be deleted.",
    );
  });
});
