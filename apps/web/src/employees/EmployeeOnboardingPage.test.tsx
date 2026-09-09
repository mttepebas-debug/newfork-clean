// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
      warning_policy: "warn",
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
        <MemoryRouter initialEntries={["/welcome/availability"]}>
          <EmployeeOnboardingPage />
          <RouteMarker />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save" }));
    expect(await screen.findByText("Onboarding refresh offline")).toBeTruthy();
    expect(screen.getByLabelText("Current test route").textContent).toBe(
      "/welcome/availability",
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
        <MemoryRouter initialEntries={["/welcome"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Availability (optional)" }),
    );
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("max")).toBe("1");
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("leaves an unsaved weekly draft without an availability prompt", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/availability"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("switch", { name: "Monday all day unavailable" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Profile and privacy" }),
    );
    expect(
      await screen.findByText("Your private employee details"),
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
        <MemoryRouter initialEntries={["/welcome/availability"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const save = await screen.findByRole("button", { name: "Save" });
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    fireEvent.click(save);
    expect(await screen.findByText("Review your onboarding")).toBeTruthy();
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
        <MemoryRouter initialEntries={["/welcome/availability"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Skip for now" }),
    );
    expect(
      await screen.findByText("Your private employee details"),
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
        <MemoryRouter initialEntries={["/welcome/availability"]}>
          <EmployeeOnboardingPage />
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

  it("uses the global account phone as the confirmed onboarding phone", async () => {
    vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/profile"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(await screen.findByLabelText("First name"), {
      target: { value: "Taylor" },
    });
    fireEvent.change(screen.getByLabelText("Last name"), {
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
    fireEvent.change(screen.getByLabelText("Emergency contact"), {
      target: { value: "Morgan Reed" },
    });
    fireEvent.change(screen.getByLabelText("Emergency relationship"), {
      target: { value: "Spouse/partner" },
    });
    fireEvent.change(screen.getByLabelText("Emergency phone"), {
      target: { value: "3105550101" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenCalledWith(
        expect.objectContaining({ phone: "3105559999" }),
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
      },
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/profile"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      ((await screen.findByLabelText("First name")) as HTMLInputElement).value,
    ).toBe("Taylor");
    expect((screen.getByLabelText("Last name") as HTMLInputElement).value).toBe(
      "Reed",
    );
  });

  it("lets the employee switch organizations without abandoning onboarding", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome"]}>
          <Routes>
            <Route path="/welcome/*" element={<EmployeeOnboardingPage />} />
            <Route
              path="/organization-switcher"
              element={<output>Organization switcher</output>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /switch organization/i }),
    );

    expect(await screen.findByText("Organization switcher")).toBeTruthy();
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
        <MemoryRouter initialEntries={["/welcome/profile"]}>
          <EmployeeOnboardingPage />
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
        <MemoryRouter initialEntries={["/welcome"]}>
          <EmployeeOnboardingPage />
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
        <MemoryRouter initialEntries={["/welcome/review"]}>
          <EmployeeOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /submit for review/i }),
    );

    await waitFor(() => expect(submitMyOnboarding).toHaveBeenCalledWith(1));
    await waitFor(() => expect(authMock.refresh).toHaveBeenCalled());
  });
});
