import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  return client;
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

// BL-662: a search that finds nothing is not an empty catalog.
it("says nothing matches when a search hides every retention policy", async () => {
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
  fireEvent.click(await screen.findByRole("tab", { name: "Retention" }));
  await screen.findByText("California payroll");
  fireEvent.change(screen.getByLabelText("Search acknowledgements"), {
    target: { value: "Texas" },
  });
  expect(screen.getByText("No retention policies match this view")).toBeTruthy();
  expect(screen.queryByText("No retention policies yet")).toBeNull();
});
it("says nothing matches when every template is archived and archived ones are hidden", async () => {
  vi.mocked(listSignatureSettings).mockResolvedValue({
    policies: [],
    templates: [
      {
        id: "00000000-0000-4000-8000-000000000020",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        name: "Uniform policy",
        archived_at: "2026-09-01T00:00:00.000Z",
      },
    ] as never,
    versions: [],
  });
  mount();
  expect(
    await screen.findByText("No acknowledgement templates match this view"),
  ).toBeTruthy();
  expect(screen.queryByText("No acknowledgement templates yet")).toBeNull();
});

// Loading and error in the "B" look (Mert 2026-10-14).
it("outlines acknowledgement settings while they load", () => {
  vi.mocked(listSignatureSettings).mockReturnValueOnce(new Promise(() => {}));
  mount();
  expect(screen.getByRole("status").textContent).toContain("Loading acknowledgement settings");
  expect(screen.queryByText("Loading acknowledgement settings...")).toBeNull();
});

it("shows the load-error card with Try again, not the server's sentence", async () => {
  vi.mocked(listSignatureSettings).mockRejectedValueOnce(new Error("settings service down"));
  mount();
  const card = await screen.findByRole("alert");
  expect(within(card).getByRole("heading", { name: "We couldn't load acknowledgement settings" })).toBeTruthy();
  expect(screen.queryByText("settings service down")).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "We couldn't load acknowledgement settings" })).toBeNull(),
  );
  expect(listSignatureSettings).toHaveBeenCalledTimes(2);
});

it("keeps the last settings and says so when a refresh fails", async () => {
  const client = mount();
  await waitFor(() => expect(listSignatureSettings).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  vi.mocked(listSignatureSettings).mockRejectedValueOnce(new Error("settings service down"));
  await act(async () => {
    await client.refetchQueries();
  });
  expect(
    await screen.findByText("Acknowledgement settings didn't refresh. This is the last list that loaded."),
  ).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "We couldn't load acknowledgement settings" })).toBeNull();
  expect(screen.queryByText("settings service down")).toBeNull();
});
