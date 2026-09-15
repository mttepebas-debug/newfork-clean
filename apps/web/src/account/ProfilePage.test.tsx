import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./ProfilePage";
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
}));

describe("ProfilePage", () => {
  it("keeps the draft on Stay and leaves only after explicit discard", async () => {
    render(<ProfilePage />);
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
    render(<ProfilePage />);
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
    render(<ProfilePage />);

    expect(screen.getByLabelText("Phone number")).toHaveProperty(
      "value",
      "+14155550142",
    );
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("previews a square crop without upload, cancels replacement and removes only on Save", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
    render(<ProfilePage />);
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
    expect(removeAccountAvatar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateAccount).toHaveBeenCalledWith("Owner User", "system", null,
      { avatarObjectPath: null, avatarUrl: null }));
    expect(removeAccountAvatar).toHaveBeenCalledWith(expect.anything(), account.userId, "old-path");
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("uploads the cropped file only on save and keeps the previous avatar on upload failure", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
    render(<ProfilePage />);
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
    render(<ProfilePage />);
    fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["svg"], "photo.svg", { type: "image/svg+xml" })] } });
    expect(screen.getByRole("alert").textContent).toMatch(/JPG, PNG or WebP/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(uploadAccountAvatar).not.toHaveBeenCalled();
  });

  it("does not delete either photo when the profile save response is uncertain", async () => {
    account = { ...account, avatarObjectPath: "old-path", avatarUrl: "https://example.test/old.png" };
    render(<ProfilePage />);
    choosePhoto();
    fireEvent.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    updateAccount.mockRejectedValueOnce(new Error("Save response unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Save response unavailable");
    expect(removeAccountAvatar).not.toHaveBeenCalled();
  });

  it("does not overwrite unsaved profile edits during account refresh", () => {
    const view = render(<ProfilePage />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Draft Owner" },
    });
    account = { ...account, displayName: "Server Owner" };
    view.rerender(<ProfilePage />);

    expect(screen.getByLabelText("Display name")).toHaveProperty(
      "value",
      "Draft Owner",
    );
  });
});

function choosePhoto() {
  fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] } });
  const image = screen.getByRole("img", { name: "Square photo preview" }).querySelector("img")!;
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 400 });
  fireEvent.load(image);
}
