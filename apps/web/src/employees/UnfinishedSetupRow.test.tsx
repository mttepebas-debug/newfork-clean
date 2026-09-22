import type { WorkspaceSummary } from "@newfork/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/request-error";
import { requestWorkspaceClosure } from "../lib/supabase";
import { UnfinishedSetupRow } from "./UnfinishedSetupRow";

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ refresh: vi.fn(async () => null) }),
}));

vi.mock("../lib/supabase", () => ({
  requestWorkspaceClosure: vi.fn(),
  setTabWorkspaceId: vi.fn(),
  supabaseClient: {},
}));

vi.mock("./onboarding-data", () => ({
  getMyOnboarding: vi.fn(),
  leaveMyOnboarding: vi.fn(),
}));

const draft = {
  id: "27000000-0000-4000-8000-000000000001",
  name: "Meyhouse",
  role: "owner",
  status: "active",
  isActive: false,
  onboarding: { status: "incomplete", currentStep: 2 },
} as unknown as WorkspaceSummary;

function renderRow() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <MemoryRouter>
        <UnfinishedSetupRow workspace={draft} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Two clicks: the first arms the button, the second runs the discard. */
function discard() {
  fireEvent.click(screen.getByRole("button", { name: /discard setup/i }));
  fireEvent.click(
    screen.getByRole("button", { name: /click again to delete/i }),
  );
}

describe("UnfinishedSetupRow", () => {
  beforeEach(() => {
    vi.mocked(requestWorkspaceClosure).mockReset();
  });

  it("answers a refusal by its key, not by the sentence the server sent", async () => {
    vi.mocked(requestWorkspaceClosure).mockRejectedValue(
      // Deliberately not the English the row used to match on.
      new RequestError(
        "Some other wording entirely",
        "session.reauthentication_required",
      ),
    );
    renderRow();
    discard();

    expect(
      await screen.findByText("Sign in again to discard this setup"),
    ).toBeDefined();
  });

  it("falls back to the general answer for any other refusal", async () => {
    vi.mocked(requestWorkspaceClosure).mockRejectedValue(
      new RequestError("Recent reauthentication required"),
    );
    renderRow();
    discard();

    expect(
      await screen.findByText("Setup could not be updated"),
    ).toBeDefined();
  });
});
