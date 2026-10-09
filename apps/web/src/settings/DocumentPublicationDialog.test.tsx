import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  documentTypeSchema,
  documentPublicationPreviewSchema,
} from "@newfork/shared";
import { DocumentPublicationDialog } from "./DocumentPublicationDialog";
import {
  previewDocumentPublication,
  publishDocumentType,
} from "./documents-data";
vi.mock("./documents-data", () => ({
  previewDocumentPublication: vi.fn(),
  publishDocumentType: vi.fn(),
}));
const id = "00000000-0000-4000-8000-000000000001";
const document = documentTypeSchema.parse({
  id,
  workspace_id: id,
  title: "Safety",
  description: "",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf"],
  tracks_expiry: false,
  expiry_warning_days: 30,
  sort_order: 0,
  archived_at: null,
  publication_status: "draft",
  publication_revision: 3,
});
const preview = documentPublicationPreviewSchema.parse({
  revision: 5,
  publication_revision: 3,
  preview_token: "bound-token",
  transition: "publish",
  target: defaultDocumentLifecycleSettings.target,
  assignment_scope: "all_active",
  locations: [{ id, name: "North" }],
  departments: [],
  jobs: [],
  named_people: [],
  employees: [
    {
      employee_id: id,
      employee_name: "Employee A",
      requirement_id: id,
      revision: 4,
      action: "update",
      matches_target: true,
      deadline_action: "restart",
    },
  ],
});
const close = vi.fn(),
  saved = vi.fn(async () => {});
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <DocumentPublicationDialog
        workspaceId={id}
        document={document}
        onClose={close}
        onSaved={saved}
      />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewDocumentPublication).mockResolvedValue(preview);
  vi.mocked(publishDocumentType).mockResolvedValue({});
});
it("shows authoritative targets and timer effects before sending the exact confirmed revision", async () => {
  mount();
  await screen.findByText("North");
  expect(screen.getByText(/Employee A.*Full current delivery/)).toBeTruthy();
  expect(publishDocumentType).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Confirm publish" }),
  ).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Publish current rules" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(publishDocumentType).toHaveBeenCalledWith(
    id,
    id,
    {
      revision: 5,
      publication_revision: 3,
      preview_token: "bound-token",
      reason: "Publish current rules",
    },
    "publish",
  );
});
it("requires a refreshed preview after a rejected stale confirmation", async () => {
  vi.mocked(publishDocumentType).mockRejectedValue(
    new Error("Impact changed; refresh preview"),
  );
  mount();
  await screen.findByText("North");
  fireEvent.change(screen.getByLabelText("Reason"), {
    target: { value: "Publish" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Confirm publish" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Confirm publish" }),
  ).toHaveProperty("disabled", true);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Refresh impact" })).toBeTruthy();
});

it("separates the selected intersection and matching employees from former-target changes", async () => {
  vi.mocked(previewDocumentPublication).mockResolvedValue({
    ...preview,
    target: {
      ...preview.target,
      operator: "and",
      location_ids: [id],
      department_ids: [id],
      job_ids: [id],
    },
    locations: [
      { id, name: "North" },
      { id: "00000000-0000-4000-8000-000000000002", name: "South" },
    ],
    departments: [{ id, name: "Kitchen" }],
    jobs: [{ id, name: "Cook" }],
    employees: [
      {
        ...preview.employees[0]!,
        employee_name: "Unchanged Match",
        action: "unchanged",
        matches_target: true,
      },
      {
        ...preview.employees[0]!,
        employee_id: "00000000-0000-4000-8000-000000000002",
        requirement_id: null,
        employee_name: "Former Target",
        action: "remove",
        matches_target: false,
      },
    ],
  });
  mount();
  await screen.findByRole("heading", { name: "Matching employees" });
  const audience = screen.getByRole("region", { name: "Target audience" });
  expect(audience.textContent).toContain("North");
  expect(audience.textContent).toContain("Kitchen");
  expect(audience.textContent).toContain("Cook");
  expect(audience.textContent).not.toContain("South");
  expect(audience.textContent).toContain("Unchanged Match");
  expect(audience.textContent).not.toContain("Former Target");
  expect(audience.textContent).toContain(
    "New hires who match these same filters",
  );
  expect(
    screen.getByText(/Former Target.*Close former assignment/),
  ).toBeTruthy();
  expect(publishDocumentType).not.toHaveBeenCalled();
});
