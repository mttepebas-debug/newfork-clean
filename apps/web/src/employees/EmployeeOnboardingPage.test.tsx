// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  configure,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubPhoneWidth } from "../lib/phone-width.test-util";
import {
  emergencyIsOwnPhoneMessage,
  phoneInUseMessage,
  usLettersMessage,
} from "@newfork/shared";
import { RequestError } from "../lib/request-error";
import EmployeeOnboardingPage from "./EmployeeOnboardingPage";
import {
  emptyWeeklyPreference,
  type Avatar,
  type LastAvatarResponse,
  type WeeklyPreferenceRead,
} from "@newfork/shared";
import { apiRequest } from "../lib/supabase";
import {
  loadWeeklyPreferences,
  saveWeeklyPreferences,
} from "../availability/availability-data";
// Whole-repo runs share the cores with three other packages; Testing
// Library's 1 s default for findBy/waitFor is what ran out there (U19).
configure({ asyncUtilTimeout: 5000 });

vi.mock("../availability/availability-data", () => ({
  loadWeeklyPreferences: vi.fn(),
  saveWeeklyPreferences: vi.fn(),
}));
import {
  getMyOnboarding,
  isMyOnboardingPhoneInUse,
  saveMyOnboardingProfile,
  submitMyOnboarding,
} from "./onboarding-data";

const authMock = vi.hoisted(() => ({
  refresh: vi.fn(async () => null),
  signOut: vi.fn(async () => undefined),
  /** The phone on the account; null for an account that has none yet. */
  phone: "+13105559999" as string | null,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account: {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "taylor@example.test",
      displayName: "Taylor Reed",
      phone: authMock.phone,
      theme: "system",
    },
    refresh: authMock.refresh,
    signOut: authMock.signOut,
  }),
}));

// AVATAR-IKON 5.1: the avatar goes through the API; one's avatar here and the last one elsewhere.
const avatarMock = vi.hoisted(() => ({
  own: null as Avatar | null,
  last: { avatar: null, from_workspace_name: null } as LastAvatarResponse,
  /** What a PUT answers with; a refusal is thrown. */
  save: vi.fn(async (_choice: unknown): Promise<void> => undefined),
}));

vi.mock("../lib/supabase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/supabase")>()),
  supabaseClient: {},
  apiRequest: vi.fn(async (_client: unknown, path: string, init?: RequestInit) => {
    if (path.endsWith("/me/last-avatar")) return avatarMock.last;
    if (!path.endsWith("/me/avatar")) throw new Error(`unexpected ${path}`);
    if (init?.method === "PUT") {
      const choice = JSON.parse(String(init.body)) as { art_key?: string };
      await avatarMock.save(choice);
      if (choice.art_key) avatarMock.own = { kind: "art", art_key: choice.art_key } as Avatar;
      return null;
    }
    const avatar = avatarMock.own;
    return { present: avatar !== null, url: null, avatar, suggested: ["001-server", "003-bartender"] };
  }),
}));

// The drawings without the real chunk.
vi.mock("../lineup-art/useLineupArt", () => ({
  useLineupArtSvgs: () => null,
  loadLineupArtSvgs: async () => ({}),
}));

vi.mock("./onboarding-data", () => ({
  getMyOnboarding: vi.fn(),
  isMyOnboardingPhoneInUse: vi.fn(),
  leaveMyOnboarding: vi.fn(),
  saveMyOnboardingProfile: vi.fn(),
  submitMyOnboarding: vi.fn(),
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

// Only an employee has the availability step (M13); their onboarding lists it.
const employeeOnboarding = {
  ...onboarding,
  requirements: [
    ...onboarding.requirements,
    {
      ...onboarding.requirements[0]!,
      id: "ab930000-0000-4000-8000-000000000003",
      kind: "availability" as const,
      title: "Availability",
      required: false,
      blocks_activation: false,
    },
  ],
};
function RouteMarker() {
  return <output aria-label="Current test route">{useLocation().pathname}</output>;
}
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
      onboarding_required: true,
      revision: 0,
    },
    employee: {
      revision: 0,
      submitted: false,
      updated_at: null,
      preference: emptyWeeklyPreference(),
    },
  };
}

describe("EmployeeOnboardingPage", () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.refresh.mockResolvedValue(null);
    authMock.phone = "+13105559999";
    avatarMock.own = null;
    avatarMock.last = { avatar: null, from_workspace_name: null };
    avatarMock.save.mockResolvedValue(undefined);
    vi.mocked(getMyOnboarding).mockResolvedValue(onboarding);
    vi.mocked(isMyOnboardingPhoneInUse).mockResolvedValue(false);
    vi.mocked(loadWeeklyPreferences).mockResolvedValue(weeklyModel());
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
        };
      },
    );
  });

  it("does not navigate using cached onboarding data when the post-save refresh fails", async () => {
    vi.mocked(getMyOnboarding)
      .mockResolvedValueOnce(employeeOnboarding)
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
    fireEvent.click(await screen.findByRole("button", { name: "Save and continue" }));
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
    expect(await screen.findByRole("button", { name: "Save and continue" })).toBeTruthy();
    // The step is listed and reachable, but an optional one never counts.
    const progress = screen.getByRole("progressbar", { name: "Steps done" });
    expect(progress.getAttribute("aria-valuenow")).toBe("0");
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  // M13: a manager or admin has no availability step; its address leads to the first step.
  it("sends a person without an availability step from its address to the first step", async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
          <RouteMarker />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Current test route").textContent).toBe(
        "/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile",
      ),
    );
    expect(loadWeeklyPreferences).not.toHaveBeenCalled();
  });

  // Mert 2026-10-17: on a phone the availability step is a fixed frame: the bar
  // and the heading stay on top, the buttons at the bottom, only the days scroll.
  it("frames the availability step on a phone, and only that step", async () => {
    stubPhoneWidth();
    try {
      vi.mocked(getMyOnboarding).mockResolvedValue(employeeOnboarding);
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
            <OnboardingRoute />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      const save = await screen.findByRole("button", { name: "Save and continue" });
      const frame = document.querySelector(".pb")!;
      expect(frame.classList.contains("pb-frame-fixed")).toBe(true);
      const list = document.querySelector(".dav-list")!;
      expect(list.classList.contains("is-scroller")).toBe(true);
      // The heading and the buttons sit outside the scrolling list.
      const heading = screen.getByRole("heading", { name: "When do you prefer not to work?" });
      expect(list.contains(heading)).toBe(false);
      expect(list.contains(save)).toBe(false);
      expect(list.querySelectorAll(".dav-row")).toHaveLength(7);
      cleanup();
      render(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/profile"]}>
            <OnboardingRoute />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await waitFor(() => expect(document.querySelector(".pb")).not.toBeNull());
      expect(document.querySelector(".pb")!.classList.contains("pb-frame-fixed")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the computer's availability step as it is: no frame, no scrolling list", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue(employeeOnboarding);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: "Save and continue" });
    expect(document.querySelector(".pb-frame-fixed")).toBeNull();
    expect(document.querySelector(".is-scroller")).toBeNull();
  });

  // One action bar: Skip for now sits with Save and continue (Tur 2).
  it("keeps Skip for now and Save and continue in the same action bar", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue(employeeOnboarding);
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/availability"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const save = await screen.findByRole("button", { name: "Save and continue" });
    const skip = screen.getByRole("button", { name: /Skip for now/ });
    expect(skip.closest(".dav-onboard-foot")).toBe(save.closest(".dav-onboard-foot"));
    expect(skip.closest(".dav-onboard-foot")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "When do you prefer not to work?" })).toBeTruthy();
    expect(screen.getByText("Optional. Mark the times you'd rather not work in a normal week.")).toBeTruthy();
    expect(document.querySelectorAll("footer.pb-bar")).toHaveLength(0);
  });

  // C2.3, P26: the onboarding step asks before unsaved hours are lost.
  it("asks before leaving an unsaved weekly draft", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue(employeeOnboarding);
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
      await screen.findByRole("radio", { name: /^Unavailable/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("Discard availability changes?");
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByRole("radio", { name: /^Unavailable/ })).toHaveProperty("ariaChecked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Profile" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(await screen.findByText("Your details")).toBeTruthy();
    expect(saveWeeklyPreferences).not.toHaveBeenCalled();
  });

  it("confirms an empty required week through the onboarding endpoint before continuing", async () => {
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...employeeOnboarding,
      first_actionable_path: "/welcome/review",
      requirements: employeeOnboarding.requirements.map((item) =>
        item.kind === "availability" ? { ...item, required: true, blocks_activation: true } : item),
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
    const save = await screen.findByRole("button", { name: "Save and continue" });
    expect(screen.queryByRole("button", { name: "Skip for now" })).toBeNull();
    expect(screen.queryByLabelText("Starts on")).toBeNull();
    fireEvent.click(save);
    expect(await screen.findByText("Check it over, then send it")).toBeTruthy();
    expect(saveWeeklyPreferences).toHaveBeenCalledWith(
      onboarding.workspace_id,
      expect.objectContaining({
        employee_id: onboarding.employee_id,
        source: "employee",
        preference: emptyWeeklyPreference(),
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
    vi.mocked(getMyOnboarding).mockResolvedValue(employeeOnboarding);
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
      await screen.findByRole("radio", { name: /^Unavailable/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(
      await screen.findByText("Settings changed; refresh required"),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: /^Unavailable/ }),
    ).toHaveProperty("ariaChecked", "true");
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

  // The account is the one source of the phone (BL-335): with a phone on the
  // account the field only shows it and points to where it changes.
  async function fillProfileAndSave(phone?: string) {
    fireEvent.change(await screen.findByLabelText("Legal first name"), {
      target: { value: "Taylor" },
    });
    if (phone !== undefined)
      fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: phone } });
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
  }

  /** Page one filled in, ready for Continue. */
  async function fillPersonal() {
    fireEvent.change(await screen.findByLabelText("Legal first name"), {
      target: { value: "Taylor" },
    });
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
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "CA" } });
    fireEvent.change(screen.getByLabelText("ZIP code"), {
      target: { value: "90012" },
    });
  }

  function renderProfileStep() {
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
  }

  it("shows the account phone read-only and says where it changes", async () => {
    vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
    renderProfileStep();

    const phone = (await screen.findByLabelText(/^Phone/)) as HTMLInputElement;
    expect(phone.value).toBe("(310) 555-9999");
    expect(phone.readOnly).toBe(true);
    expect(
      screen.getByRole("link", { name: "Account › Profile" }).getAttribute("href"),
    ).toBe("/account/profile");

    await fillProfileAndSave();
    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenCalledWith(
        onboarding.workspace_id,
        // Both numbers go in E.164 (BL-503).
        expect.objectContaining({
          phone: "+13105559999",
          emergency_contact_phone: "+13105550101",
        }),
        1,
      ),
    );
  });

  it("takes a phone from the employee when the account has none", async () => {
    authMock.phone = null;
    vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
    renderProfileStep();

    const phone = (await screen.findByLabelText(/^Phone/)) as HTMLInputElement;
    expect(phone.value).toBe("");
    expect(phone.readOnly).toBe(false);
    expect(screen.queryByRole("link", { name: "Account › Profile" })).toBeNull();

    await fillProfileAndSave("4155550135");
    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenCalledWith(
        onboarding.workspace_id,
        expect.objectContaining({ phone: "+14155550135" }),
        1,
      ),
    );
  });

  it("prefills the legal name from the employer-provided employee record", async () => {
    authMock.phone = null;
    vi.mocked(getMyOnboarding).mockResolvedValue({
      ...onboarding,
      profile: {
        legal_first_name: "Taylor",
        legal_last_name: "Reed",
        phone: "+14155550123",
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
    expect(screen.getByLabelText(/^Phone/)).toHaveProperty("value", "(415) 555-0123");
  });

  // BL-503: KARARLAR "Form ve girdi kuralları (ABD)".
  it("draws both phones with a fixed +1", async () => {
    authMock.phone = null;
    renderProfileStep();
    const own = await screen.findByLabelText(/^Phone/);
    expect(own.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    await fillPersonal();
    fireEvent.change(own, { target: { value: "4155550135" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
    const contact = await screen.findByLabelText("Phone");
    expect(contact.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    fireEvent.change(contact, { target: { value: "310555010199" } });
    expect(contact).toHaveProperty("value", "(310) 555-0101");
  });

  // TEL-2 (Mert, 2026-10-09): a number somebody else in the workspace has is
  // said under the field, which turns red; nothing on the page moves.
  /** What a field's aria-describedby points at. */
  function describedText(field: HTMLElement) {
    return (field.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
  }

  it("says under the phone that somebody in the workspace has it, and does not move on", async () => {
    authMock.phone = null;
    vi.mocked(isMyOnboardingPhoneInUse).mockImplementation(
      async (_workspace, phone) => phone === "+14155550135",
    );
    renderProfileStep();
    await fillPersonal();
    const own = screen.getByLabelText(/^Phone/);
    const slot = own.closest(".onboarding-field")?.querySelector(".field-note");
    // Before the error only the help is there; no room is kept for the error (UI-FIELDMSG-2).
    expect(slot?.textContent).toBe("The number this workspace can reach you on.");
    expect(own.closest(".onboarding-field")?.textContent).not.toContain(phoneInUseMessage);
    expect(own.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(own, { target: { value: "4155550135" } });
    await waitFor(() => expect(own.getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(own)).toBe(phoneInUseMessage);
    expect(isMyOnboardingPhoneInUse).toHaveBeenCalledWith(onboarding.workspace_id, "+14155550135");
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
    expect(screen.queryByLabelText("Full name")).toBeNull();

    fireEvent.change(own, { target: { value: "4155550136" } });
    await waitFor(() => expect(own.getAttribute("aria-invalid")).toBeNull());
    expect(describedText(own)).toBe("The number this workspace can reach you on.");
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
    expect(await screen.findByLabelText("Full name")).toBeTruthy();
  });

  it("asks only once the number is whole", async () => {
    authMock.phone = null;
    renderProfileStep();
    const own = await screen.findByLabelText(/^Phone/);
    fireEvent.change(own, { target: { value: "415555013" } });
    await Promise.resolve();
    expect(isMyOnboardingPhoneInUse).not.toHaveBeenCalled();
  });

  it("points to Account › Profile when the account's phone is somebody else's here", async () => {
    vi.mocked(isMyOnboardingPhoneInUse).mockResolvedValue(true);
    renderProfileStep();
    const own = await screen.findByLabelText(/^Phone/);
    await waitFor(() => expect(own.getAttribute("aria-invalid")).toBe("true"));
    expect(describedText(own)).toBe(`${phoneInUseMessage} Change it in Account › Profile.`);
    expect(
      screen.getByRole("link", { name: "Account › Profile" }).getAttribute("href"),
    ).toBe("/account/profile");
  });

  it("refuses the person's own number for the emergency contact until one digit differs", async () => {
    authMock.phone = null;
    vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
    renderProfileStep();
    await fillPersonal();
    fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: "4155550135" } });
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
    fireEvent.change(await screen.findByLabelText("Full name"), { target: { value: "Morgan Reed" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "Friend" } });
    const contact = screen.getByLabelText("Phone");
    // No room is kept before the refusal (UI-FIELDMSG-2, Mert 2026-10-18).
    expect(contact.closest(".onboarding-field")?.querySelector(".field-note")).toBeNull();
    expect(contact.closest(".onboarding-field")?.textContent).not.toContain(emergencyIsOwnPhoneMessage);
    expect(contact.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(contact, { target: { value: "4155550135" } });
    expect(contact.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(contact)).toBe(emergencyIsOwnPhoneMessage);
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    expect(saveMyOnboardingProfile).not.toHaveBeenCalled();

    fireEvent.change(contact, { target: { value: "(415) 555-013" } });
    expect(contact.getAttribute("aria-invalid")).toBeNull();
    fireEvent.change(contact, { target: { value: "(415) 555-0137" } });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenCalledWith(
        onboarding.workspace_id,
        expect.objectContaining({ phone: "+14155550135", emergency_contact_phone: "+14155550137" }),
        1,
      ),
    );
  });

  it.each([
    ["onboarding.phone_in_use", phoneInUseMessage],
    ["onboarding.emergency_is_own_phone", emergencyIsOwnPhoneMessage],
  ])("says the server's %s refusal in the screen's words", async (reason, sentence) => {
    vi.mocked(saveMyOnboardingProfile).mockRejectedValue(
      new RequestError("refused", reason, undefined, 409),
    );
    renderProfileStep();
    await fillProfileAndSave();
    expect(await screen.findByText(sentence)).toBeTruthy();
  });

  // BL-1046: the onboarding moved on since the page read it (another tab, the
  // manager's review). It reloads, says so, and keeps what was typed; the next
  // Save goes on the latest revision.
  it("reloads a profile saved over a newer onboarding, keeps what was typed and saves on the latest", async () => {
    vi.mocked(getMyOnboarding)
      .mockResolvedValueOnce(onboarding)
      .mockResolvedValue({ ...onboarding, revision: 3 });
    vi.mocked(saveMyOnboardingProfile)
      .mockRejectedValueOnce(
        new RequestError("onboarding changed; refresh required", "onboarding.changed", undefined, 409),
      )
      .mockResolvedValue(4);
    renderProfileStep();
    await fillProfileAndSave();
    expect(
      await screen.findByText(
        "Your onboarding changed meanwhile. You're seeing the latest version; check it and try again.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("onboarding changed; refresh required")).toBeNull();
    await waitFor(() => expect(getMyOnboarding).toHaveBeenCalledTimes(2));
    expect((screen.getByLabelText("Full name") as HTMLInputElement).value).toBe("Morgan Reed");
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));
    await waitFor(() =>
      expect(saveMyOnboardingProfile).toHaveBeenLastCalledWith(
        onboarding.workspace_id,
        expect.objectContaining({ legal_first_name: "Taylor", emergency_contact_name: "Morgan Reed" }),
        3,
      ),
    );
  });

  it("reloads onboarding sent from an old copy and says so", async () => {
    const ready = {
      ...onboarding,
      first_actionable_path: "/welcome/review",
      requirements: [{ ...onboarding.requirements[0]!, status: "completed" as const }],
    };
    vi.mocked(getMyOnboarding).mockResolvedValueOnce(ready).mockResolvedValue({ ...ready, revision: 2 });
    vi.mocked(submitMyOnboarding).mockRejectedValue(
      new RequestError("onboarding changed; refresh required", "onboarding.changed", undefined, 409),
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/review"]}>
          <OnboardingRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /send for review/i }));
    expect(
      await screen.findByText(
        "Your onboarding changed meanwhile. You're seeing the latest version; check it and try again.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(getMyOnboarding).toHaveBeenCalledTimes(2));
  });

  it.each([["Legal first name"], ["Preferred name"], ["Street address"], ["City"]])(
    "says under %s that Turkish-only letters are not taken, and does not move on",
    async (label) => {
      renderProfileStep();
      await fillPersonal();
      const field = screen.getByLabelText(new RegExp(`^${label}`));
      fireEvent.change(field, { target: { value: "Şişli" } });
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const described = (field.getAttribute("aria-describedby") ?? "").split(" ");
      expect(
        described.map((id) => document.getElementById(id)?.textContent),
      ).toContain(usLettersMessage);
      fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
      expect(screen.queryByLabelText("Full name")).toBeNull();
    },
  );

  it("says under the contact's name that Turkish-only letters are not taken", async () => {
    renderProfileStep();
    await fillPersonal();
    fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
    const name = await screen.findByLabelText("Full name");
    fireEvent.change(name, { target: { value: "Ayşe Yılmaz" } });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(name.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      usLettersMessage,
    );
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

  // ROL-CIFT 6.2: approval lands on the page the accesses open, not always on
  // Employee Hub: somebody who also manages lands on Workspace.
  it.each([
    ["only works shifts", { employee: true, management: null }, ["workspace.read", "employee_hub.read"], "/app/employee-hub"],
    ["also manages", { employee: true, management: "manager" }, ["workspace.read", "employee_hub.read"], "/app/workspace"],
    // ROL-CIFT 6.4 (S-166): somebody who only manages finishes setup and lands on Workspace.
    ["only manages", { employee: false, management: "manager" }, ["workspace.read"], "/app/workspace"],
  ] as const)("lands somebody who %s, once onboarding is approved, where the accesses open", async (_who, access, actions, landing) => {
    function RouteMarker() {
      return <output aria-label="Current test route">{useLocation().pathname}</output>;
    }
    const completedProfileRequirement = { ...onboarding.requirements[0]!, status: "completed" as const };
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
    authMock.refresh.mockResolvedValue({
      workspace: { id: onboarding.workspace_id, name: "Meyhouse" },
      membership: { access },
      permissions: [],
      actions: [...actions],
    } as never);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/welcome/6ea5d512-bc7f-4cf3-aad4-2f0815de00fd/review"]}>
          <OnboardingRoute />
          <RouteMarker />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /send for review/i }));
    await waitFor(() => expect(screen.getByLabelText("Current test route").textContent).toBe(landing));
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

  // AVATAR-IKON 5.1 (Mert, 19 Oct: B): a new workspace starts with the person's last avatar.
  describe("Your avatar", () => {
    const avatarPath = `/v1/workspaces/${onboarding.workspace_id}/me/avatar`;
    const lastFromHarbor: LastAvatarResponse = {
      avatar: { kind: "art", art_key: "001-server" },
      from_workspace_name: "Harbor & Vine",
    };
    const avatarBox = async () =>
      (await screen.findByRole("group", { name: "Your avatar" })) as HTMLElement;
    const useLastSent = () =>
      vi.mocked(apiRequest).mock.calls.some(
        ([, path, init]) => path === avatarPath && init?.body === JSON.stringify({ use_last: true }),
      );
    beforeEach(() => {
      // jsdom has no modal dialogs: the avatar window opens as an open <dialog>.
      HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
    });

    it("offers the last avatar from the other workspace, with Change", async () => {
      avatarMock.last = lastFromHarbor;
      renderProfileStep();
      const box = await avatarBox();
      expect(
        await within(box).findByText(
          "From your Harbor & Vine profile. It will be your avatar here too, unless you change it.",
        ),
      ).toBeTruthy();
      expect(within(box).getByRole("button", { name: "Change" })).toBeTruthy();
      expect(within(box).queryByRole("button", { name: "Add avatar" })).toBeNull();
      expect(box.querySelector(".member-avatar--art")).not.toBeNull();
    });

    it("keeps the last avatar here once the profile is saved", async () => {
      avatarMock.last = lastFromHarbor;
      vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
      renderProfileStep();
      await within(await avatarBox()).findByRole("button", { name: "Change" });
      await fillProfileAndSave();
      await waitFor(() => expect(useLastSent()).toBe(true));
      expect(avatarMock.save).toHaveBeenCalledWith({ use_last: true });
      const putOrder = vi
        .mocked(apiRequest)
        .mock.invocationCallOrder[
          vi.mocked(apiRequest).mock.calls.findIndex(([, , init]) => init?.method === "PUT")
        ]!;
      expect(vi.mocked(saveMyOnboardingProfile).mock.invocationCallOrder[0]!).toBeLessThan(putOrder);
    });

    it("does not send the last avatar once the person chose another one", async () => {
      avatarMock.last = lastFromHarbor;
      vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
      renderProfileStep();
      fireEvent.click(await within(await avatarBox()).findByRole("button", { name: "Change" }));
      const picker = screen.getByRole("dialog", { name: "Your avatar" });
      // The window starts on the suggestion.
      expect(within(picker).getByText("Server")).toBeTruthy();
      fireEvent.click(within(picker).getByRole("radio", { name: "Shaker" }));
      fireEvent.click(within(picker).getByRole("button", { name: "Save" }));
      // The window saves at once, apart from the step's Save and continue.
      await waitFor(() => expect(avatarMock.save).toHaveBeenCalledWith({ art_key: "003-bartender" }));
      expect(saveMyOnboardingProfile).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Your avatar" })).toBeNull());
      expect(
        await within(await avatarBox()).findByText("Your avatar in Meyhouse."),
      ).toBeTruthy();

      await fillProfileAndSave();
      await waitFor(() => expect(saveMyOnboardingProfile).toHaveBeenCalled());
      await waitFor(() => expect(getMyOnboarding).toHaveBeenCalledTimes(2));
      expect(useLastSent()).toBe(false);
    });

    it("offers Add avatar with initials when there is no last avatar", async () => {
      renderProfileStep();
      const box = await avatarBox();
      expect(
        await within(box).findByText("Optional. Upload your photo or pick one of ours."),
      ).toBeTruthy();
      expect(within(box).getByRole("button", { name: "Add avatar" })).toBeTruthy();
      expect(within(box).queryByRole("button", { name: "Change" })).toBeNull();
      expect(box.querySelector(".member-avatar--initials")?.textContent).toBe("TR");
      fireEvent.click(within(box).getByRole("button", { name: "Add avatar" }));
      expect(screen.getByRole("dialog", { name: "Your avatar" })).toBeTruthy();
    });

    it("moves on without an avatar, and sends none", async () => {
      vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
      renderProfileStep();
      await within(await avatarBox()).findByRole("button", { name: "Add avatar" });
      await fillProfileAndSave();
      await waitFor(() => expect(getMyOnboarding).toHaveBeenCalledTimes(2));
      expect(
        vi.mocked(apiRequest).mock.calls.some(([, , init]) => init?.method === "PUT"),
      ).toBe(false);
    });

    it("moves on when keeping the last avatar fails", async () => {
      avatarMock.last = lastFromHarbor;
      avatarMock.save.mockRejectedValue(new RequestError("offline", undefined, undefined, 503));
      vi.mocked(saveMyOnboardingProfile).mockResolvedValue(2);
      renderProfileStep();
      await within(await avatarBox()).findByRole("button", { name: "Change" });
      await fillProfileAndSave();
      await waitFor(() => expect(getMyOnboarding).toHaveBeenCalledTimes(2));
      expect(avatarMock.save).toHaveBeenCalledWith({ use_last: true });
    });
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
