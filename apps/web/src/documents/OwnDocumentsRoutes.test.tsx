import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { OwnDocumentsRedirect, OwnDocumentsRoute } from "./OwnDocumentsRoutes";

let membership: { access: { employee: boolean; management: string | null } };
vi.mock("../auth/AuthContext", () => ({
  // No actions at all: a person whose papers are overdue has the rest of the
  // workspace shut by the core, and still reaches their documents.
  useAuth: () => ({ context: { workspace: { id: "w" }, membership, actions: [], permissions: [] } }),
}));

function Where() {
  const { pathname, search } = useLocation();
  return <p>at {pathname + search}</p>;
}

function renderAt(address: string) {
  return render(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/account/documents" element={<OwnDocumentsRedirect />} />
        <Route
          path="/app/employee-hub/documents"
          element={
            <OwnDocumentsRoute view="employee">
              <h1>Documents</h1>
            </OwnDocumentsRoute>
          }
        />
        <Route
          path="/app/my-documents"
          element={
            <OwnDocumentsRoute view="management">
              <h1>My documents</h1>
            </OwnDocumentsRoute>
          }
        />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

describe("one's own documents' addresses (MY-DOCUMENTS)", () => {
  it("opens Documents for an employee the core has shut out of everything else", () => {
    membership = { access: { employee: true, management: null } };
    renderAt("/app/employee-hub/documents?kind=acknowledgement");
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
  });

  it("sends each to the interface that is theirs, keeping the query", () => {
    membership = { access: { employee: true, management: null } };
    renderAt("/app/my-documents?kind=acknowledgement");
    expect(screen.getByText("at /app/employee-hub/documents?kind=acknowledgement")).toBeTruthy();
  });

  it("sends somebody who only manages to My documents", () => {
    membership = { access: { employee: false, management: "manager" } };
    renderAt("/app/employee-hub/documents");
    expect(screen.getByRole("heading", { name: "My documents" })).toBeTruthy();
  });

  it("lets somebody with both accesses open either", () => {
    membership = { access: { employee: true, management: "owner" } };
    renderAt("/app/employee-hub/documents");
    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
  });

  it("takes Account's old address on, with its query", () => {
    membership = { access: { employee: true, management: null } };
    renderAt("/account/documents?workspace=w&requirement=r");
    expect(screen.getByText("at /app/employee-hub/documents?workspace=w&requirement=r")).toBeTruthy();
    membership = { access: { employee: true, management: "admin" } };
    renderAt("/account/documents");
    expect(screen.getByText("at /app/my-documents")).toBeTruthy();
  });
});
