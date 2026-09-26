import { describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { legalNameErrorMessage, onboardingUnfinished, ownedWorkspaces } from "./legal-name-data";

vi.mock("../lib/supabase", () => ({ supabaseClient: null }));

const summary = (id: string, role: "owner" | "manager", status: "active" | "pending" | "removed") => ({
  id,
  name: id,
  role,
  status,
  isActive: false,
  onboarding: { status: "complete" as const, currentStep: 4 },
});

describe("legal name data (BL-080)", () => {
  it("keeps only workspaces this account actively owns", () => {
    const list = [
      summary("a", "owner", "active"),
      summary("b", "manager", "active"),
      summary("c", "owner", "removed"),
    ];
    expect(ownedWorkspaces(list).map((workspace) => workspace.id)).toEqual(["a"]);
    expect(ownedWorkspaces(undefined)).toEqual([]);
  });

  it("treats only a pending membership as unfinished onboarding", () => {
    const list = [summary("a", "manager", "pending"), summary("b", "manager", "active")];
    expect(onboardingUnfinished(list, "a")).toBe(true);
    expect(onboardingUnfinished(list, "b")).toBe(false);
    expect(onboardingUnfinished(undefined, "a")).toBe(false);
  });

  it("says the database's own sentence for a bad name and a plain one otherwise", () => {
    expect(
      legalNameErrorMessage(
        new RequestError("a legal name needs a first and a last name", undefined, undefined, 400),
      ),
    ).toBe("A legal name needs a first and a last name");
    expect(
      legalNameErrorMessage(new RequestError("Not allowed", "authz.workspace_closed", undefined, 403)),
    ).toBe("This has been closed, so its records can no longer be changed.");
    expect(legalNameErrorMessage(new RequestError("Not found", "authz.not_member", undefined, 404))).toBe(
      "That could not be saved. Try again.",
    );
    expect(legalNameErrorMessage(new Error("boom"))).toBe("That could not be saved. Try again.");
  });
});
