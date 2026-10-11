import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, expect, it, vi } from "vitest";
import SignatureTemplatesSettingsPage from "./SignatureTemplatesSettingsPage";
import { listSignatureSettings } from "./signature-templates-data";

const auth = vi.hoisted(() => ({
  // The role still lists the key; only the core's answer (actions) may decide.
  permissions: ["documents.read", "documents.manage"],
  actions: [] as string[],
}));
vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    context: {
      workspace: { id: "00000000-0000-4000-8000-000000000001" },
      permissions: auth.permissions,
      actions: auth.actions,
    },
  }),
}));
vi.mock("./signature-templates-data", () => ({
  approveSignatureRetentionPolicy: vi.fn(),
  listSignatureSettings: vi.fn(),
  publishSignatureTemplate: vi.fn(),
  saveSignatureRetentionPolicy: vi.fn(),
  saveSignatureTemplateDraft: vi.fn(),
  setSignatureRetentionPolicyArchived: vi.fn(),
  setSignatureTemplateArchived: vi.fn(),
  unapproveSignatureRetentionPolicy: vi.fn(),
  unpublishSignatureTemplate: vi.fn(),
}));

function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SignatureTemplatesSettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.actions = ["settings.signature_templates.read"];
  vi.mocked(listSignatureSettings).mockResolvedValue({
    policies: [],
    templates: [],
    versions: [],
  });
});

it("offers adding a template when the core opens document settings writing", async () => {
  auth.actions.push("settings.documents.write");
  mount();
  expect(
    await screen.findByRole("button", { name: "Add template" }),
  ).toBeTruthy();
});

it("offers no writing when the core does not open it, whatever the role lists", async () => {
  mount();
  await screen.findByRole("tab", { name: "Retention" });
  expect(screen.queryByRole("button", { name: "Add template" })).toBeNull();
});

// BL-1010: "Approve policy" closed the row menu, so its confirm step only showed
// once the menu was opened again.
it("keeps the row menu open on the approval's confirm step", async () => {
  auth.actions.push("settings.documents.write");
  vi.mocked(listSignatureSettings).mockResolvedValue({
    policies: [
      {
        id: "00000000-0000-4000-8000-000000000010",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        name: "California payroll",
        retention_trigger: "signed_at",
        duration_days: 1460,
        jurisdiction_scope: "California",
        authority_reference: "Labor Code 226",
        status: "draft",
        approved_at: null,
        archived_at: null,
      },
    ] as never,
    templates: [],
    versions: [],
  });
  mount();
  const tab = await screen.findByRole("tab", { name: "Retention" });
  fireEvent.click(tab);
  const actions = await screen.findByRole("button", { name: "Actions for California payroll" });
  fireEvent.click(actions);
  const menu = actions.closest("details")!;
  menu.setAttribute("open", "");
  fireEvent.click(screen.getByRole("button", { name: "Approve policy" }));

  expect(menu.hasAttribute("open")).toBe(true);
  expect(screen.getByRole("button", { name: "Confirm approval" })).toBeTruthy();
});
