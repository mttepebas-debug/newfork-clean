// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import {
  EmployeeAssignmentDocumentPreview,
  type useEmployeeDocumentAssignmentPreview,
} from "./EmployeeAssignmentDocumentPreview";

type Query = ReturnType<typeof useEmployeeDocumentAssignmentPreview>;

const query = (state: Partial<Query>) =>
  ({ isFetching: false, error: null, data: [], refetch: vi.fn(), ...state }) as unknown as Query;

// Loading and error in the "B" look (Mert 2026-10-14).
describe("EmployeeAssignmentDocumentPreview", () => {
  it("outlines the check while it runs", () => {
    render(<EmployeeAssignmentDocumentPreview query={query({ isFetching: true })} />);
    expect(screen.getByRole("status").textContent).toBe("Checking document requirements");
  });

  it("shows the load-error card with Try again, not the server's sentence", () => {
    const refetch = vi.fn();
    render(
      <EmployeeAssignmentDocumentPreview
        query={query({ error: new Error("preview service down"), refetch } as Partial<Query>)}
      />,
    );
    // An h4: the section's own title above it is an h3.
    expect(screen.getByRole("heading", { level: 4, name: "We couldn't check document requirements" })).toBeTruthy();
    expect(screen.queryByText("preview service down")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("says a refusal in its own sentence, not as a connection problem", () => {
    render(
      <EmployeeAssignmentDocumentPreview
        query={query({
          error: new RequestError("Location out of scope", "authz.out_of_scope", undefined, 403),
        } as Partial<Query>)}
      />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "You don't have access to check documents for these choices.",
    );
    expect(screen.queryByText("Location out of scope")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says when nothing changes", () => {
    render(<EmployeeAssignmentDocumentPreview query={query({})} />);
    expect(screen.getByText("No document requirements will change.")).toBeTruthy();
  });
});
