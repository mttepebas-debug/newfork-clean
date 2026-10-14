import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import { EmployeeDocumentPanel } from "./EmployeeDocumentPanel";
import EmployeeDocumentsPage from "./EmployeeDocumentsPage";

const auth = vi.hoisted(() => ({
  // The role's keys open everything; only the core's answer (actions) may decide.
  permissions: ["employee_documents.read", "employee_documents.review"],
  actions: [] as string[],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "00000000-0000-4000-8000-000000000001" },
      userId: "00000000-0000-4000-8000-000000000009",
      permissions: auth.permissions,
      actions: auth.actions,
    },
  }),
}));
vi.mock("./EmployeeDocumentsList", () => ({
  EmployeeDocumentsList: ({ canReview }: { canReview: boolean }) => (
    <div>Documents list, review {String(canReview)}</div>
  ),
  useEmployeeDocuments: () => ({ error: null }),
}));

beforeEach(() => {
  auth.actions = [];
});

it("shows a person's documents with review when the core opens both", () => {
  auth.actions = ["documents.read", "documents.review"];
  render(<EmployeeDocumentPanel employeeId="e1" />);
  expect(screen.getByText("Documents list, review true")).toBeTruthy();
});

it("shows the documents read-only when the core opens reading but not review", () => {
  auth.actions = ["documents.read"];
  render(<EmployeeDocumentPanel employeeId="e1" />);
  expect(screen.getByText("Documents list, review false")).toBeTruthy();
});

it("shows nothing to somebody the core holds back, whatever their role grants", () => {
  const { container } = render(<EmployeeDocumentPanel employeeId="e1" />);
  expect(container.textContent).toBe("");
});

it("offers review on Employees → Documents only when the core opens it", () => {
  auth.actions = ["documents.read"];
  const { unmount } = render(
    <MemoryRouter>
      <EmployeeDocumentsPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("Documents list, review false")).toBeTruthy();
  unmount();
  auth.actions = ["documents.read", "documents.review"];
  render(
    <MemoryRouter>
      <EmployeeDocumentsPage />
    </MemoryRouter>,
  );
  expect(screen.getByText("Documents list, review true")).toBeTruthy();
});
