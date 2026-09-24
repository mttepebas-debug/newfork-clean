// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EmployeeOnboardingPage from "./EmployeeOnboardingPage";
import {
  emptyWeeklyPreference,
  type WeeklyPreferenceRead,
} from "@newfork/shared";
import {
  loadWeeklyPreferences,
  previewWeeklyPreferences,
  saveWeeklyPreferences,
} from "../availability/availability-data";
vi.mock("../availability/availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
  previewWeeklyPreferences: vi.fn(),
  saveWeeklyPreferences: vi.fn(),
}));
import {
  getMyOnboarding,
  saveMyOnboardingProfile,
  submitMyOnboarding,
} from "./onboarding-data";

const authMock = vi.hoisted(() => ({
  refresh: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "taylor@example.test",
      displayName: "Taylor Reed",
      phone: "3105559999",
      theme: "system",
    },
    refresh: authMock.refresh,
    signOut: authMock.signOut,
  }),
}));

vi.mock("./onboarding-data", () => ({
  getMyOnboarding: vi.fn(),
  leaveMyOnboarding: vi.fn(),
  saveMyOnboardingProfile: vi.fn(),
  resetMyOnboarding: vi.fn(),
  submitMyOnboarding: vi.fn(),
  uploadMyDocument: vi.fn(),
  acknowledgeMyRequirement: vi.fn(),
}));

function OnboardingRoute() {
  return (
    <Routes>
      <Route
        path="/welcome/:workspaceId/*"
        element={<EmployeeOnboardingPage />}
      />
      <Route path="/welcome" element={<p>Welcome redirect</p>} />
    </Routes>
  );
}

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

function weeklyModel(): WeeklyPreferenceRead {
  return {
    employee_id: onboarding.employee_id,
    employee_name: onboarding.employee_name,
    can_edit_employee: true,
    can_manage: false,
    manager: null,
    time_format: "24h",
    shift_types: [],
    settings: {
      input_mode: "time_range",
      onboarding_required: true,
      revision: 0,
    },
    employee: {
      revision: 0,
      submitted: false,
      updated_at: null,
      preference: emptyWeeklyPreference("time_range"),
    },
  };
}

describe("EmployeeOnboardingPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.refresh.mockResolvedValue(null);
    vi.mocked(getMyOnboarding).mockResolvedValue(onboarding);
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
    vi.mocked(previewWeeklyPreferences).mockResolvedValue({ items: [] });
    vi.mocked(saveWeeklyPreferences).mockImplementation(
      async (_workspace, command) => {
        const model = weeklyModel();
        model.employee = {
          ...model.employee,
          submitted: true,
          revision: 1,
          preference: command.preference,
        };
        return {
          model,
          finalized: [],
          kept_count: 0,
          cancelled_count: 0,
          resolved_count: 0,
        };
      },
    );
  });

  it("does not navigate using cached onboarding data when the post-save refresh fails", async () => {
    vi.mocked(getMyOnboarding)
      .mockResolvedValueOnce(onboarding)
      .mockRejectedValue(new Error("Onboarding refresh offline"));
    function RouteMarker() {
      return (
        <output aria-label="Current test route">
          {useLocation().pathname}
        </output>
      );
    }
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
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
          <RouteMarker />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(
      await screen.findByText(
        "Try again, or ask your manager to check your invitation.",
      ),
    ).toBeTruthy();
    expect(screen.getByLabelText("Current test route").textContent).toBe(
      "/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability",
    );
    expect(saveWeeklyPreferences).toHaveBeenCalledOnce();
    expect(authMock.refresh).not.toHaveBeenCalled();
  });
  it("makes optional availability reachable without counting it as an activation requirement", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      progress_total: 1,
      requirements: [
        ...onboarding.requirements,
        {
          ...onboarding.requirements[0]!,
          id: "ab930000-0000-4000-8000-000000000002",
          kind: "availability",
          title: "Availability",
          required: false,
          blocks_activation: false,
        },
      ],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Availability (optional)" }),
    );
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
    // The step is listed and reachable, but an optional one never counts.
    const progress = screen.getByRole("progressbar", { name: "Steps done" });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("leaves an unsaved weekly draft without an availability prompt", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("switch", { name: "Monday all day unavailable" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(
      await screen.findByText("Your details"),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("confirms an empty required week through the onboarding endpoint before continuing", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      first_actionable_path: "/welcome/review",
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const save = await screen.findByRole("button", { name: "Save" });
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    fireEvent.click(save);
    expect(await screen.findByText("Check it over, then send it")).toBeTruthy();
    expect(saveWeeklyPreferences).toHaveBeenCalledWith(
      onboarding.workspace_id,
      expect.objectContaining({
        employee_id: onboarding.employee_id,
        source: "employee",
        preference: emptyWeeklyPreference("time_range"),
      }),
      expect.any(String),
      true,
    );
    expect(loadWeeklyPreferences).toHaveBeenCalledWith(
      onboarding.workspace_id,
      onboarding.employee_id,
      true,
    );
  });

  it("skips optional availability without fabricating a saved declaration", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      requirements: [
        ...onboarding.requirements,
        {
          ...onboarding.requirements[0]!,
          id: "ab930000-0000-4000-8000-000000000002",
          kind: "availability",
          title: "Availability",
          required: false,
          blocks_activation: false,
        },
      ],
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Skip for now" }),
    );
    expect(
      await screen.findByText("Your details"),
    ).toBeTruthy();
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("keeps the weekly draft and route after a rejected save", async () => {
    vi.mocked(saveWeeklyPreferences).mockRejectedValueOnce(
      new Error("Settings changed; refresh required"),
    );
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("switch", { name: "Monday all day unavailable" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("Settings changed; refresh required"),
    ).toBeTruthy();
    expect(
      screen.getByRole("switch", { name: "Monday all day unavailable" }),
    ).toHaveProperty("checked", true);
    expect(getMyOnboarding).toHaveBeenCalledOnce();
  });

  it("opens the server-derived first requirement from the welcome surface", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText("Let's set up your employee account"),
    ).toBeTruthy();
    expect(screen.getByText("Downtown")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /begin/i }));
    expect(
      await screen.findByText("Your details"),
    ).toBeTruthy();
  });

  it("suggests the account phone for an empty field but saves the employee's edit", async () => {
    vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText("Legal first name"), {
      target: { value: "Taylor" },
    });
    expect(screen.getByLabelText(/^Phone/)).toHaveProperty("value", "3105559999");
    expect(screen.getByLabelText(/^Phone/)).toHaveProperty("readOnly", false);
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: "4155550135" } });
    fireEvent.change(screen.getByLabelText("Legal last name"), {
      target: { value: "Reed" },
    });
    fireEvent.change(screen.getByLabelText("Date of birth"), {
      target: { value: "1990-02-14" },
    });
    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "100 Main Street" },
    });
    fireEvent.change(screen.getByLabelText("City"), {
      target: { value: "Los Angeles" },
    });
    fireEvent.change(screen.getByLabelText("State"), {
      target: { value: "CA" },
    });
    fireEvent.change(screen.getByLabelText("ZIP code"), {
      target: { value: "90012" },
    });
    // Page one only moves on; the emergency contact lives on page two and the
    // draft has to survive the move because the server saves the whole profile.
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));

    fireEvent.change(await screen.findByLabelText("Full name"), {
      target: { value: "Morgan Reed" },
    });
    fireEvent.change(screen.getByLabelText("Relationship"), {
      target: { value: "Spouse/partner" },
    });
    fireEvent.change(screen.getByLabelText("Phone"), {
      target: { value: "3105550101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenCalledWith(
        onboarding.workspace_id,
        expect.objectContaining({ phone: "4155550135" }),
        1,
      ),
    );
  });

  it("prefills the legal name from the employer-provided employee record", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      profile: {
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "4155550123",
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      ((await screen.findByLabelText("Legal first name")) as HTMLInputElement).value,
    ).toBe("Taylor");
    expect((screen.getByLabelText("Legal last name") as HTMLInputElement).value).toBe(
      "Reed",
    );
    expect(screen.getByLabelText(/^Phone/)).toHaveProperty("value", "4155550123");
  });

  it("lets the employee step back to the account landing without abandoning onboarding", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"]}>
          <Routes>
            <Route
              path="/welcome/:workspaceId/*"
              element={<EmployeeOnboardingPage />}
            />
            <Route
              path="/workspaces"
              element={<output>Account landing</output>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Exit onboarding" }),
    );

    expect(await screen.findByText("Account landing")).toBeTruthy();
  });

  it("shows the rejected profile reason on the correction step", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      case_status: "changes_requested",
      first_actionable_path: "/welcome/profile",
      requirements: [
        {
          ...onboarding.requirements[0]!,
          status: "rejected" as const,
          rejection_reason: "Legal name does not match the employee record.",
        },
      ],
    });

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText("Legal name does not match the employee record."),
    ).toBeTruthy();
  });

  it("lets the employee sign out without mutating onboarding", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    await waitFor(() => expect(authMock.signOut).toHaveBeenCalledOnce());
  });

  it("refreshes workspace context after submit activates onboarding", async () => {
    const completedProfileRequirement = {
      ...onboarding.requirements[0]!,
      status: "completed" as const,
    };
    vi.mocked(getMyOnboarding)
      .mockResolvedValueOnce({
        ...onboarding,
        case_status: "in_progress",
        first_actionable_path: "/welcome/review",
        progress_completed: 1,
        requirements: [completedProfileRequirement],
      })
      .mockResolvedValueOnce({
        ...onboarding,
        membership_status: "active",
        case_status: "approved",
        first_actionable_path: "/app/employee-hub",
        progress_completed: 1,
        requirements: [completedProfileRequirement],
      });
    vi.mocked(submitMyOnboarding).mockResolvedValue(2);

    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/review"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /send for review/i }),
    );

    await waitFor(() =>
      expect(submitMyOnboarding).toHaveBeenCalledWith(
        onboarding.workspace_id,
        1,
      ),
    );
    await waitFor(() => expect(authMock.refresh).toHaveBeenCalled());
  });

  it("loads the onboarding of the workspace in the route and keeps stored paths under it", async () => {
    function RouteMarker() {
      return (
        <output aria-label="Current test route">{useLocation().pathname}</output>
      );
    }
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd"]}>
          <OnboardingRoute />
          <RouteMarker />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /begin/i }));

    expect(getMyOnboarding).toHaveBeenCalledWith(onboarding.workspace_id);
    expect(screen.getByLabelText("Current test route").textContent).toBe(
      "/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile",
    );
  });

  it("sends links from before workspace routes back through the welcome redirect", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/profile"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Welcome redirect")).toBeTruthy();
    expect(getMyOnboarding).not.toHaveBeenCalled();
  });

  describe("step list", () => {
    const renderSteps = async () => {
      render(
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <MemoryRouter
            initialEntries={[
              "/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile",
            ]}
          >
            <OnboardingRoute />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      return within(
        await screen.findByRole("navigation", { name: "Onboarding steps" }),
      );
    };

    it("counts every listed step, and a conditional document is not optional", async () => {
      vi.mocked(getMyOnboarding).mockResolvedValue({
        ...onboarding,
        requirements: [
          ...onboarding.requirements,
          {
            // The server sends conditional documents with required=false but
            // still counts them and blocks "Submit for review" on them.
            ...onboarding.requirements[0]!,
            id: "ab930000-0000-4000-8000-000000000005",
            kind: "document",
            title: "Work permit",
            required: false,
            document_mode: "conditional",
          },
        ],
      });

      const nav = await renderSteps();
      expect(nav.getByRole("button", { name: "Documents" })).toBeTruthy();
      expect(nav.queryByRole("button", { name: /optional/i })).toBeNull();
      expect(
        screen.getByRole("progressbar", { name: "Steps done" }).getAttribute(
          "aria-valuemax",
        ),
      ).toBe(String(nav.getAllByRole("button").length));
    });

    it("groups documents and policies into one step instead of listing each one", async () => {
      vi.mocked(getMyOnboarding).mockResolvedValue({
        ...onboarding,
        requirements: [
          ...onboarding.requirements,
          {
            ...onboarding.requirements[0]!,
            id: "ab930000-0000-4000-8000-000000000003",
            kind: "document",
            title: "Food handler card",
          },
          {
            ...onboarding.requirements[0]!,
            id: "ab930000-0000-4000-8000-000000000004",
            kind: "acknowledgement",
            title: "Team handbook",
          },
        ],
      });

      const nav = await renderSteps();
      expect(nav.getByRole("button", { name: "Documents" })).toBeTruthy();
      expect(nav.queryByRole("button", { name: "Policies" })).toBeNull();
      expect(nav.queryByText("Food handler card")).toBeNull();
      expect(nav.queryByText("Team handbook")).toBeNull();
    });
  });
});
