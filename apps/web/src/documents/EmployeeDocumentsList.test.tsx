// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { listDocuments } from "./document-data";
import { EmployeeDocumentsList } from "./EmployeeDocumentsList";

vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ context: null }) }));
vi.mock("./document-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./document-data")>()),
  listDocuments: vi.fn(),
}));

describe("no access (FB-6.1.9)", () => {
  it("shows the no-access card, not the raw error, when the API refuses these documents (FB-6.1.9)", async () => {
    vi.mocked(listDocuments).mockRejectedValue(
      new RequestError("Forbidden", "authz.missing_permission", undefined, 403),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EmployeeDocumentsList
            audience={{ workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd", selfOnly: false }}
            userId="d9f43e62-e099-48e1-bc6f-a5aabe8e87d5"
            canReview={false}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "You don't have access to these documents" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Home" }).getAttribute("href")).toBe("/workspaces");
    expect(screen.queryByText("Forbidden")).toBeNull();
  });
});
