import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import ProfilePage from "./ProfilePage";
import { ownLegalNameKey } from "./legal-name-data";
import {
  getOwnLegalName,
  listAccountWorkspaces,
  listOwnEmploymentRecords,
  saveOwnLegalName,
} from "../lib/supabase";
import { emergencyIsOwnPhoneMessage, usLettersMessage } from "@newfork/shared";
import { RequestError } from "../lib/request-error";
import { requestAppNavigation } from "../shell/leave-guard";
import { uploadAccountAvatar, removeAccountAvatar } from "../lib/supabase";
import { cropAvatar } from "./avatar-crop";
import {
  requestPreferredName,
  saveOwnEmploymentContact,
} from "../employees/employee-data";

vi.mock("./avatar-crop", async importOriginal => ({
  ...await importOriginal<typeof import("./avatar-crop")>(),
  cropAvatar: vi.fn(async () => new File(["cropped"], "profile.png", { type: "image/png" })),
}));

let account: AccountProfile;
const updateAccount = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account,
    updateAccount,
  }),
}));

vi.mock("../employees/employee-data", () => ({
  requestPreferredName: vi.fn(async () => "waiting"),
  saveOwnEmploymentContact: vi.fn(async () => undefined),
}));

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  uploadAccountAvatar: vi.fn(),
  removeAccountAvatar: vi.fn(async () => undefined),
  listAccountWorkspaces: vi.fn(async () => []),
  listOwnEmploymentRecords: vi.fn(async () => []),
  getOwnLegalName: vi.fn(async () => null),
  saveOwnLegalName: vi.fn(async () => undefined),
}));

const ownedWorkspaceId = "51000000-0000-4000-8000-000000000001";
function workspace(role: "owner" | "employee", status: "active" | "pending" = "active") {
  return {
    id: ownedWorkspaceId,
    name: "Meyhouse",
    role,
    status,
    isActive: true,
    onboarding: { status: "complete" as const, currentStep: 4 },
  };
}

function renderProfile() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/account/profile"]}>
        <Routes>
          <Route path="/account/profile" element={<ProfilePage />} />
          <Route path="/welcome/:workspaceId" element={<p>Setup screen</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function contactRecord(workspaceId: string, over: Record<string, string> = {}) {
  return {
    workspaceId,
    workspaceName: "Meyhouse",
    employeeId: `emp-${workspaceId}`,
    preferredName: "",
    phone: null,
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyContactPhone: "",
    emergencyContactEmail: "",
    ...over,
  };
}

describe("ProfilePage", () => {
  it("keeps the draft on Stay and leaves only after explicit discard", async () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Unsaved name" } });
    const navigate = vi.fn();
    act(() => requestAppNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByLabelText("Preferred name")).toHaveProperty("value", "Unsaved name");
    expect(navigate).not.toHaveBeenCalled();
    act(() => requestAppNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    await waitFor(() => expect(screen.getByLabelText("Preferred name")).toHaveProperty("value", "Owner User"));
    expect(navigate).toHaveBeenCalledOnce();
    expect(updateAccount).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    vi.mocked(uploadAccountAvatar).mockResolvedValue({ avatarObjectPath: "new-path", avatarUrl: "https://example.test/new.png" });
    // clearAllMocks keeps a test's own answers; each test says which workspaces it has.
    vi.mocked(listAccountWorkspaces).mockResolvedValue([]);
    account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner User",
      phone: "+14155550142",
      avatarUrl: null,
      theme: "system",
      timeFormat: "system",
      dateFormat: "system",
    };
  });

  it("saves global profile details only after the form becomes dirty", async () => {
    renderProfile();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    const submitButton = screen.getByRole("button", { name: "Save" });
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Preferred name"), {
      target: { value: "Owner Updated" },
    });
    fireEvent.click(submitButton);
    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(
        "Owner Updated",
        "system",
        "+14155550142",
        { avatarObjectPath: null, avatarUrl: null },
      ),
    );
  });

  it("hydrates a saved global phone without writing workspace employee data", () => {
    account = { ...account, phone: "+14155550142" };
    renderProfile();

    expect(screen.getByLabelText("Phone number")).toHaveProperty(
      "value",
      "(415) 555-0142",
    );
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("previews a square crop without upload, cancels replacement and removes only on Save", async () => {
    account = { ...account, avatarUrl: "https://example.test/old.png" };
    renderProfile();
    expect(screen.getByRole("button", { name: "Replace" })).toBeTruthy();
    choosePhoto();
    screen.getByRole("button", { name: "Use photo" }).focus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Use photo" }), { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByLabelText("Zoom"));
    fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(cropAvatar).toHaveBeenCalledWith(expect.anything(), 2, 50, 50);
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
    choosePhoto();
    screen.getByLabelText("Choose profile photo").focus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel crop" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Replace" }),
      ),
    );
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(removeAccountAvatar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", "+14155550142",
      { avatarObjectPath: null, avatarUrl: null }));
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("uploads the cropped file only on save and keeps the previous avatar on upload failure", async () => {
    account = { ...account, avatarUrl: "https://example.test/old.png" };
    renderProfile();
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    vi.mocked(uploadAccountAvatar).mockRejectedValueOnce(new Error("Upload failed"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Upload failed");
    expect(removeAccountAvatar).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", "+14155550142",
      { avatarObjectPath: "new-path", avatarUrl: "https://example.test/new.png" }));
  });

  // Mert's phone notes 2026-10-17 #10: a new photo alone saves, though a
  // field elsewhere on the page is still empty; a field edit still waits.
  it("saves a new photo alone while another required field is still empty", async () => {
    account = { ...account, phone: null };
    renderProfile();
    expect(screen.getByText(/To save, fill in phone number/)).toBeTruthy();
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(/To save, fill in/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Owner Updated" } });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/To save, fill in phone number/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Owner User" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", null,
      { avatarObjectPath: "new-path", avatarUrl: "https://example.test/new.png" }));
  });

  it("rejects unsupported files before opening crop or touching storage", () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["svg"], "photo.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert").textContent).toMatch(/JPG, PNG or WebP/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("does not delete either photo when the profile save response is uncertain", async () => {
    account = { ...account, avatarUrl: "https://example.test/old.png" };
    renderProfile();
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    updateAccount.mockRejectedValueOnce(new Error("Save response unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Save response unavailable");
    expect(removeAccountAvatar).not.toHaveBeenCalled();
  });

  it("does not overwrite unsaved profile edits during account refresh", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Preferred name"), {
      target: { value: "Draft Owner" },
    });
    account = { ...account, displayName: "Server Owner" };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Preferred name")).toHaveProperty(
      "value",
      "Draft Owner",
    );
  });

  // BL-080: the owner's legal name, the one documents read, is theirs to change here.
  it("shows the owner their legal name and saves a change to it", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockResolvedValue({
      firstName: "Mert",
      middleName: "",
      lastName: "Tepebas",
    });
    renderProfile();

    const first = await screen.findByLabelText("Legal first name");
    await waitFor(() => expect(first).toHaveProperty("value", "Mert"));
    expect(getOwnLegalName).toHaveBeenCalledWith(expect.anything(), ownedWorkspaceId);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Legal middle name"), {
      target: { value: "Ali" },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(saveOwnLegalName).toHaveBeenCalledWith(expect.anything(), ownedWorkspaceId, {
        firstName: "Mert",
        middleName: "Ali",
        lastName: "Tepebas",
      }),
    );
    expect(await screen.findByText("Profile saved")).toBeTruthy();
    // One Save covers both, and only what changed is written.
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("does not show a legal name to somebody who owns nothing", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("employee")]);
    renderProfile();

    await waitFor(() => expect(listAccountWorkspaces).toHaveBeenCalled());
    expect(screen.queryByLabelText("Legal first name")).toBeNull();
    expect(getOwnLegalName).not.toHaveBeenCalled();
  });

  it("says why a legal name was not saved", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockResolvedValue({
      firstName: "Mert",
      middleName: "",
      lastName: "Tepebas",
    });
    vi.mocked(saveOwnLegalName).mockRejectedValue(
      new RequestError("Not allowed", "authz.owner_only", undefined, 403),
    );
    renderProfile();

    const last = await screen.findByLabelText("Legal last name");
    await waitFor(() => expect(last).toHaveProperty("value", "Tepebas"));
    fireEvent.change(last, { target: { value: "Tepebasi" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only the owner can change this legal name.",
    );
  });

  it("asks somebody still onboarding to finish before keeping contacts here", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("employee", "pending")]);
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      {
        workspaceId: ownedWorkspaceId,
        workspaceName: "Meyhouse",
        employeeId: "97f65b16-a7ad-4f50-990e-d89030ac4701",
        preferredName: "",
        phone: null,
        emergencyContactName: "",
        emergencyContactRelationship: "",
        emergencyContactPhone: "",
        emergencyContactEmail: "",
      },
    ]);
    renderProfile();

    expect(
      await screen.findByText(
        "Finish setting up your account here, then you can add your emergency contact.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Contact name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Continue setup for Meyhouse" }));
    expect(await screen.findByText("Setup screen")).toBeTruthy();
  });

  it("says a legal name could not be loaded, not that it could not be saved", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockRejectedValue(new Error("offline"));
    renderProfile();

    const card = await screen.findByRole("alert");
    expect(within(card).getByRole("heading", { name: "We couldn't load your legal name" })).toBeTruthy();
    expect(card.textContent).not.toMatch(/saved|offline/);
    expect(screen.queryByLabelText("Legal first name")).toBeNull();
    vi.mocked(getOwnLegalName).mockResolvedValue({ firstName: "Mert", middleName: "", lastName: "Tepebas" });
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    const first = await screen.findByLabelText("Legal first name");
    await waitFor(() => expect(first).toHaveProperty("value", "Mert"));
    expect(screen.queryByRole("heading", { name: "We couldn't load your legal name" })).toBeNull();
  });

  it("keeps the legal name on screen and says so when a refresh fails", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockResolvedValue({ firstName: "Mert", middleName: "", lastName: "Tepebas" });
    const { queryClient } = renderProfile();
    const first = await screen.findByLabelText("Legal first name");
    await waitFor(() => expect(first).toHaveProperty("value", "Mert"));
    vi.mocked(getOwnLegalName).mockRejectedValue(new Error("offline"));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ownLegalNameKey(ownedWorkspaceId) });
    });
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Your legal name didn't refresh.");
    expect(screen.getByLabelText("Legal first name")).toHaveProperty("value", "Mert");
    expect(screen.queryByText("offline")).toBeNull();
  });

  it("shows an outline while the legal name loads", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockReturnValue(new Promise(() => {}) as never);
    renderProfile();

    expect(await screen.findByText("Loading your legal name")).toBeTruthy();
    expect(screen.queryByLabelText("Legal first name")).toBeNull();
  });

  it("keeps Save off while a required field is empty, and lets the middle and preferred names stay empty", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockResolvedValue({
      firstName: "Mert",
      middleName: "",
      lastName: "Tepebas",
    });
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      contactRecord(ownedWorkspaceId, {
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
    ]);
    renderProfile();
    await screen.findByDisplayValue("Mert");
    await screen.findByDisplayValue("Morgan");
    const save = screen.getByRole("button", { name: "Save" });

    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "" } });
    expect(save).toHaveProperty("disabled", false);

    fireEvent.change(screen.getByLabelText("Legal middle name"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "415 555 0142" } });
    expect(save).toHaveProperty("disabled", false);

    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Morgan" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "" } });
    expect(save).toHaveProperty("disabled", true);
  });

  it("shows Discard only once something changed", () => {
    renderProfile();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ay" } });
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
  });

  it("writes one emergency contact and the preferred name to every workspace with one Save", async () => {
    const second = "51000000-0000-4000-8000-000000000002";
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace("employee"),
      { ...workspace("employee"), id: second, name: "Ridgeline" },
    ]);
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      contactRecord(ownedWorkspaceId, {
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
      contactRecord(second, { workspaceName: "Ridgeline" }),
    ]);
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    // No workspace names: it is one person's one contact.
    expect(screen.queryByText("Ridgeline")).toBeNull();

    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ay" } });
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveOwnEmploymentContact).toHaveBeenCalledTimes(2));
    expect(saveOwnEmploymentContact).toHaveBeenCalledWith(
      second,
      `emp-${second}`,
      // A US number in E.164 (BL-503).
      expect.objectContaining({ name: "Sam", relationship: "Spouse", phone: "+14155550199" }),
    );
    expect(requestPreferredName).toHaveBeenCalledTimes(2);
    expect(updateAccount).toHaveBeenCalledWith("Ay", "system", "+14155550142", expect.anything());
    expect(await screen.findByText(/manager needs to approve/)).toBeTruthy();
  });

  it("keeps Save open when one workspace refuses, names it, and sends only that one again", async () => {
    const second = "51000000-0000-4000-8000-000000000002";
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      workspace("employee"),
      { ...workspace("employee"), id: second, name: "Ridgeline" },
    ]);
    const before = [
      contactRecord(ownedWorkspaceId, {
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
      contactRecord(second, {
        workspaceName: "Ridgeline",
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
    ];
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue(before);
    // Meyhouse takes both; Ridgeline refuses both the first time.
    vi.mocked(saveOwnEmploymentContact).mockImplementation(async (workspaceId) => {
      if (workspaceId === second) throw new Error("Emergency contact could not be saved");
    });
    vi.mocked(requestPreferredName).mockImplementation(async (workspaceId) => {
      if (workspaceId === second) throw new Error("refused");
      return "published";
    });
    renderProfile();
    await screen.findByDisplayValue("Morgan");

    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ay" } });
    fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Sam" } });
    // After the Save, Meyhouse holds the new values and Ridgeline the old ones.
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      {
        ...before[0]!,
        preferredName: "Ay",
        emergencyContactName: "Sam",
        emergencyContactPhone: "+14155550199",
      },
      before[1]!,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("could not be sent to Ridgeline");
    expect(alert.textContent).toContain("could not be saved in Ridgeline");
    expect(alert.textContent).not.toContain("Meyhouse");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false),
    );
    expect(screen.getByLabelText("Contact name")).toHaveProperty("value", "Sam");
    expect(screen.getByLabelText("Preferred name")).toHaveProperty("value", "Ay");

    vi.mocked(saveOwnEmploymentContact).mockClear();
    vi.mocked(requestPreferredName).mockClear();
    vi.mocked(saveOwnEmploymentContact).mockResolvedValue(undefined);
    vi.mocked(requestPreferredName).mockResolvedValue("published");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saveOwnEmploymentContact).toHaveBeenCalledTimes(1));
    expect(saveOwnEmploymentContact).toHaveBeenCalledWith(
      second,
      `emp-${second}`,
      expect.objectContaining({ name: "Sam" }),
    );
    expect(requestPreferredName).toHaveBeenCalledTimes(1);
    expect(requestPreferredName).toHaveBeenCalledWith(second, `emp-${second}`, "Ay");
  });

  // EMP-001 (BL-444): the core refuses one's own contact where access has
  // ended or the workspace is closed. Trying again changes nothing there.
  // Access taken away while the form is open answers 404 authz.not_member.
  it.each([
    ["authz.not_active", 403],
    ["authz.workspace_closed", 403],
    ["authz.not_member", 404],
  ])(
    "says an emergency contact can no longer be changed where the answer is %s",
    async (reason, status) => {
      const second = "51000000-0000-4000-8000-000000000002";
      vi.mocked(listAccountWorkspaces).mockResolvedValue([
        workspace("employee"),
        { ...workspace("employee"), id: second, name: "Ridgeline" },
      ]);
      vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
        contactRecord(ownedWorkspaceId, {
          emergencyContactName: "Morgan",
          emergencyContactRelationship: "Spouse",
          emergencyContactPhone: "+14155550199",
        }),
        contactRecord(second, { workspaceName: "Ridgeline" }),
      ]);
      vi.mocked(saveOwnEmploymentContact).mockImplementation(async (workspaceId) => {
        if (workspaceId === second) throw new RequestError("Not allowed", reason, "employee.save_own_contact", status);
      });
      renderProfile();
      await screen.findByDisplayValue("Morgan");
      fireEvent.change(screen.getByLabelText("Contact name"), { target: { value: "Sam" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "Your emergency contact can no longer be changed in Ridgeline: your access there has ended or the workspace is closed.",
      );
      vi.mocked(saveOwnEmploymentContact).mockResolvedValue(undefined);
    },
  );

  // BL-471: the preferred name has the same dead end as the contact above.
  it.each([
    ["authz.not_active", 403],
    ["authz.workspace_closed", 403],
    ["authz.not_member", 404],
  ])(
    "says a preferred name can no longer be changed where the answer is %s",
    async (reason, status) => {
      const second = "51000000-0000-4000-8000-000000000002";
      vi.mocked(listAccountWorkspaces).mockResolvedValue([
        workspace("employee"),
        { ...workspace("employee"), id: second, name: "Ridgeline" },
      ]);
      vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
        contactRecord(ownedWorkspaceId, {
          emergencyContactName: "Morgan",
          emergencyContactRelationship: "Spouse",
          emergencyContactPhone: "+14155550199",
        }),
        contactRecord(second, {
          workspaceName: "Ridgeline",
          emergencyContactName: "Morgan",
          emergencyContactRelationship: "Spouse",
          emergencyContactPhone: "+14155550199",
        }),
      ]);
      vi.mocked(requestPreferredName).mockImplementation(async (workspaceId) => {
        if (workspaceId === second)
          throw new RequestError("Not allowed", reason, "employee.request_preferred_name", status);
        return "published";
      });
      renderProfile();
      await screen.findByDisplayValue("Morgan");
      fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ay" } });
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe(
        "Your preferred name can no longer be changed in Ridgeline: your access there has ended or the workspace is closed.",
      );
      vi.mocked(requestPreferredName).mockResolvedValue("published");
    },
  );

  it("asks an owner to finish setting up a workspace before its emergency contact", async () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([
      { ...workspace("owner"), onboarding: { status: "incomplete" as const, currentStep: 2 } },
    ]);
    vi.mocked(getOwnLegalName).mockResolvedValue({
      firstName: "Jordan",
      middleName: "",
      lastName: "Rivera",
    });
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      contactRecord(ownedWorkspaceId),
    ]);
    renderProfile();
    await screen.findByDisplayValue("Jordan");

    // Its employee routes are shut until setup is done, so no form to refuse.
    expect(await screen.findByText(/Finish setting up this workspace/)).toBeTruthy();
    expect(screen.queryByLabelText("Contact name")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Account › Workspaces" }).getAttribute("href"),
    ).toBe("/account/workspaces");
    expect(screen.queryByText(/To save, fill in/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Legal first name"), { target: { value: "Jordana" } });
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
  });

  it("says which required fields are missing while Save is off", async () => {
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      contactRecord(ownedWorkspaceId, {
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
    ]);
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    expect(screen.queryByText(/To save, fill in/)).toBeNull();

    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "" } });
    expect(screen.getByText("To save, fill in phone number and relationship.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("button", { name: "Save" }).getAttribute("aria-describedby"),
    ).toBe("profile-missing");
  });
});

function choosePhoto() {
  fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] } });
  const image = screen.getByRole("img", { name: "Square photo preview" }).querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 400 });
  fireEvent.load(image);
}

// BL-503: KARARLAR "Form ve girdi kuralları (ABD)" on Account > Profile.
describe("ProfilePage US form rules", () => {
  const ownerWithContact = () => {
    vi.mocked(listAccountWorkspaces).mockResolvedValue([workspace("owner")]);
    vi.mocked(getOwnLegalName).mockResolvedValue({ firstName: "Mert", middleName: "", lastName: "Tepebas" });
    vi.mocked(listOwnEmploymentRecords).mockResolvedValue([
      contactRecord(ownedWorkspaceId, {
        emergencyContactName: "Morgan",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+14155550199",
      }),
    ]);
  };
  const saysUnder = (label: string) => {
    const field = screen.getByLabelText(label);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby") ?? "")?.textContent).toBe(usLettersMessage);
  };

  it("draws both phones with a fixed +1 and drops the international hint", async () => {
    ownerWithContact();
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    for (const label of ["Phone number", "Contact phone"]) {
      const field = screen.getByLabelText(label);
      expect(field.closest(".us-phone-field")?.querySelector(".us-phone-prefix")?.textContent).toBe("+1");
    }
    expect((screen.getByLabelText("Contact phone") as HTMLInputElement).value).toBe("(415) 555-0199");
    expect(screen.queryByText(/Outside the US or Canada/)).toBeNull();
  });

  // TEL-2 (Mert, 2026-10-09): the emergency contact is somebody else.
  it("refuses the account's own number as the contact's until one digit differs", async () => {
    ownerWithContact();
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    const contact = screen.getByLabelText("Contact phone");
    // No room is kept before the refusal (UI-FIELDMSG-2, Mert 2026-10-18).
    expect(contact.closest(".account-field")?.querySelector(".field-note")).toBeNull();
    expect(contact.closest(".account-field")?.textContent).not.toContain(emergencyIsOwnPhoneMessage);
    expect(contact.getAttribute("aria-invalid")).toBeNull();

    fireEvent.change(contact, { target: { value: "4155550142" } });
    expect(contact.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(contact.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      emergencyIsOwnPhoneMessage,
    );
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);

    fireEvent.change(contact, { target: { value: "(415) 555-014" } });
    expect(contact.getAttribute("aria-invalid")).toBeNull();
    expect(contact.getAttribute("aria-describedby")).toBeNull();

    // The account's number moving onto the contact's says so under the contact.
    fireEvent.change(contact, { target: { value: "4155550199" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "4155550199" } });
    expect(contact.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  // TEL-2 review: a record refuses an emergency number equal to its own at
  // every step, so the account's number takes the contact's old one only after
  // the contact has moved on.
  it("saves the new contact first when the account takes the contact's old number", async () => {
    ownerWithContact();
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    fireEvent.change(screen.getByLabelText("Contact phone"), { target: { value: "3105550111" } });
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "4155550199" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalled());
    expect(vi.mocked(saveOwnEmploymentContact).mock.invocationCallOrder.at(-1)!).toBeLessThan(
      updateAccount.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("saves the account first when the contact takes the account's old number", async () => {
    ownerWithContact();
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "3105550111" } });
    fireEvent.change(screen.getByLabelText("Contact phone"), { target: { value: "4155550142" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saveOwnEmploymentContact).toHaveBeenCalled());
    expect(updateAccount.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      vi.mocked(saveOwnEmploymentContact).mock.invocationCallOrder.at(-1)!,
    );
  });

  it("keeps one line under Preferred name: the rule while it is broken, else the help", async () => {
    ownerWithContact();
    renderProfile();
    await screen.findByDisplayValue("Morgan");
    const help = "Shown everywhere except documents. A manager approves it.";
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ayşe" } });
    expect(screen.queryByText(help)).toBeNull();
    fireEvent.change(screen.getByLabelText("Preferred name"), { target: { value: "Ayse" } });
    expect(screen.getByText(help)).toBeTruthy();
    expect(screen.queryByText(usLettersMessage)).toBeNull();
  });

  it.each([["Preferred name"], ["Legal last name"], ["Contact name"], ["Relationship"]])(
    "says under %s that Turkish-only letters are not taken, and keeps Save off",
    async (label) => {
      ownerWithContact();
      renderProfile();
      await screen.findByDisplayValue("Mert");
      await screen.findByDisplayValue("Morgan");
      fireEvent.change(screen.getByLabelText(label), { target: { value: "Ayşe" } });
      saysUnder(label);
      expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    },
  );
});
