import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./ProfilePage";
import {
  getOwnLegalName,
  listAccountWorkspaces,
  listOwnEmploymentRecords,
  listWorkspaceIdentities,
  saveOwnLegalName,
} from "../lib/supabase";
import { RequestError } from "../lib/request-error";
import { requestAvailabilityNavigation } from "../availability/availability-navigation";
import { uploadAccountAvatar, removeAccountAvatar } from "../lib/supabase";
import { cropAvatar } from "./avatar-crop";

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

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  uploadAccountAvatar: vi.fn(),
  removeAccountAvatar: vi.fn(async () => undefined),
  listWorkspaceIdentities: vi.fn(async () => []),
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
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

describe("ProfilePage", () => {
  it("keeps the draft on Stay and leaves only after explicit discard", async () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Unsaved name" } });
    const navigate = vi.fn();
    act(() => requestAvailabilityNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(screen.getByLabelText("Display name")).toHaveProperty("value", "Unsaved name");
    expect(navigate).not.toHaveBeenCalled();
    act(() => requestAvailabilityNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    await waitFor(() => expect(screen.getByLabelText("Display name")).toHaveProperty("value", "Owner User"));
    expect(navigate).toHaveBeenCalledOnce();
    expect(updateAccount).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    vi.mocked(uploadAccountAvatar).mockResolvedValue({ avatarObjectPath: "new-path", avatarUrl: "https://example.test/new.png" });
    account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner User",
      phone: null,
      avatarObjectPath: null,
      avatarUrl: null,
      theme: "system",
      timeFormat: "system",
      dateFormat: "system",
    };
  });

  it("saves global profile details only after the form becomes dirty", async () => {
    renderProfile();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    const submitButton = screen.getByRole("button", { name: "Save changes" });
    expect(submitButton).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Owner Updated" },
    });
    fireEvent.click(submitButton);
    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith(
        "Owner Updated",
        "system",
        null,
        { avatarObjectPath: null, avatarUrl: null },
      ),
    );
  });

  it("hydrates a saved global phone without writing workspace employee data", () => {
    account = { ...account, phone: "+14155550142" };
    renderProfile();

    expect(screen.getByLabelText("Phone number")).toHaveProperty(
      "value",
      "+14155550142",
    );
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("previews a square crop without upload, cancels replacement and removes only on Save", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
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
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", null,
      { avatarObjectPath: null, avatarUrl: null }));
    expect(removeAccountAvatar).toHaveBeenCalledWith(expect.anything(), account.userId, "old-path");
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("uploads the cropped file only on save and keeps the previous avatar on upload failure", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
    renderProfile();
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    vi.mocked(uploadAccountAvatar).mockRejectedValueOnce(new Error("Upload failed"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Upload failed");
    expect(removeAccountAvatar).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", null,
      { avatarObjectPath: "new-path", avatarUrl: "https://example.test/new.png" }));
    expect(removeAccountAvatar).toHaveBeenCalledWith(expect.anything(), account.userId, "old-path");
  });

  it("rejects unsupported files before opening crop or touching storage", () => {
    renderProfile();
    fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["svg"], "photo.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert").textContent).toMatch(/JPG, PNG or WebP/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("does not delete either photo when the profile save response is uncertain", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
    renderProfile();
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    updateAccount.mockRejectedValueOnce(new Error("Save response unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Save response unavailable");
    expect(removeAccountAvatar).not.toHaveBeenCalled();
  });

  // The account is global and each workspace keeps its own record of the person.
  // Nothing on screen said so, so editing the name above looked like it changed
  // what a workspace has on file.
  it("shows the record each workspace keeps beside the account's own name", async () => {
    vi.mocked(listWorkspaceIdentities).mockResolvedValue([
      {
        workspaceId: "51000000-0000-4000-8000-000000000001",
        workspaceName: "Meyhouse",
        role: "owner",
        employeeName: "Mert Tepebas",
        employeeCode: "E-0001",
      },
      {
        workspaceId: "51000000-0000-4000-8000-000000000002",
        workspaceName: "Ridgeline",
        role: "employee",
        employeeName: null,
        employeeCode: null,
      },
    ]);
    renderProfile();

    expect(
      await screen.findByRole("heading", {
        name: "How you appear in each workspace",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Mert Tepebas")).toBeTruthy();
    expect(screen.getByText("E-0001")).toBeTruthy();
    expect(screen.getByText("No record yet")).toBeTruthy();
    expect(screen.getByText("Employee")).toBeTruthy();
  });

  it("says nothing at all when the account belongs nowhere", async () => {
    vi.mocked(listWorkspaceIdentities).mockResolvedValue([]);
    renderProfile();

    await screen.findByLabelText("Display name");
    expect(screen.queryByText("How you appear in each workspace")).toBeNull();
  });

  it("does not overwrite unsaved profile edits during account refresh", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Draft Owner" },
    });
    account = { ...account, displayName: "Server Owner" };
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ProfilePage />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Display name")).toHaveProperty(
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
    const save = screen.getByRole("button", { name: "Save legal name" });
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
    expect(await screen.findByText("Legal name saved")).toBeTruthy();
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
    fireEvent.change(last, { target: { value: "Tepebaş" } });
    fireEvent.click(screen.getByRole("button", { name: "Save legal name" }));

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
      await screen.findByText("Finish onboarding here first, then keep these details up to date."),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Emergency contact")).toBeNull();
  });
});

function choosePhoto() {
  fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] } });
  const image = screen.getByRole("img", { name: "Square photo preview" }).querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 400 });
  fireEvent.load(image);
}
