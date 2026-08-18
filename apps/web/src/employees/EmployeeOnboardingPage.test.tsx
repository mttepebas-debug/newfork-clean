// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeOnboardingPage from "./EmployeeOnboardingPage";
import { getMyOnboarding } from "./onboarding-data";

vi.mock("./onboarding-data", () => ({
  getMyOnboarding: vi.fn(),
  saveMyOnboardingProfile: vi.fn(),
  saveMySsn: vi.fn(),
  saveMyAvailability: vi.fn(),
  submitMyOnboarding: vi.fn(),
  uploadMyDocument: vi.fn(),
  acknowledgeMyRequirement: vi.fn(),
}));

const onboarding = {
  case_id: "0e4e60ab-a80c-4f95-a70d-8c01ab3e9a33",
  workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
  workspace_name: "Meyhouse",
  employee_id: "fe201916-aa0e-480b-9144-1e1c8da20a31",
  employee_name: "Taylor Reed",
  membership_id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4",
  membership_status: "pending_activation" as const,
  case_status: "in_progress" as const,
  revision: 1,
  progress_completed: 0,
  progress_total: 3,
  first_actionable_path: "/welcome/profile",
  ssn_status: { present: false, last_four: null },
  profile: null,
  availability: null,
  assignments: { locations: ["Downtown"], jobs: ["Server"] },
  requirements: [
    {
      id: "75134aae-a542-44b4-b375-fd4452a55f88",
      kind: "profile" as const,
      title: "Profile and privacy",
      description: "Private profile",
      status: "not_started" as const,
      required: true,
      blocks_activation: true,
      requires_review: false,
      sort_order: 10,
      source_id: null,
      accepted_formats: [],
      content_text: null,
      content_digest: null,
      intent_statement: null,
      rejection_reason: null,
    },
  ],
};

describe("EmployeeOnboardingPage", () => {
  beforeEach(() => {
    vi.mocked(getMyOnboarding).mockResolvedValue(onboarding);
  });

  it("opens the server-derived first requirement from the welcome surface", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("Let's prepare your employee account"),
    ).toBeTruthy();
    expect(screen.getByText("Downtown")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /begin/i }));
    expect(
      await screen.findByText("Your private employee details"),
    ).toBeTruthy();
  });
});
