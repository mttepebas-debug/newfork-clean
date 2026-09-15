import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecurityPage from "./SecurityPage";
import {
  cancelAccountEmailChange,
  changeAccountPassword,
  loadAccountDeletionBlockers,
  loadAccountSecurityState,
  requestSecureAccountDeletion,
  resendAccountEmailChange,
} from "../lib/supabase";

const account: AccountProfile = {
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
const signOut = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ account, context: null, signOut }),
}));

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  developmentBearerToken: () => null,
  loadAccountSecurityState: vi.fn(),
  loadAccountDeletionBlockers: vi.fn(),
  requestAccountEmailChange: vi.fn(),
  resendAccountEmailChange: vi.fn(),
  cancelAccountEmailChange: vi.fn(),
  changeAccountPassword: vi.fn(),
  signOutOtherAccountSessions: vi.fn(),
  requestSecureAccountDeletion: vi.fn(),
}));

describe("SecurityPage", () => {
  it("uses real verification state and requires a separate deletion confirmation", async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    render(<SecurityPage />);
    expect(await screen.findByText("Primary email · not verified")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
    expect(within(dialog).getByText(/kept for 14 days/)).toBeTruthy();
    expect(requestSecureAccountDeletion).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("button", { name: "Confirm account deletion" })).toHaveProperty("disabled", true);
    fireEvent.change(within(dialog).getByLabelText("Current password"), { target: { value: "current-password" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm account deletion" }));
    await waitFor(() => expect(requestSecureAccountDeletion).toHaveBeenCalledWith({}, "current-password"));
  });
  beforeEach(() => {
    HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
    vi.clearAllMocks();
    vi.mocked(loadAccountSecurityState).mockResolvedValue({
      email: account.email,
      pendingEmail: null,
      emailChangeSentAt: null,
      emailVerified: false,
    });
    vi.mocked(loadAccountDeletionBlockers).mockResolvedValue([]);
    vi.mocked(resendAccountEmailChange).mockResolvedValue(undefined);
    vi.mocked(cancelAccountEmailChange).mockResolvedValue(undefined);
    vi.mocked(changeAccountPassword).mockResolvedValue(undefined);
    vi.mocked(requestSecureAccountDeletion).mockResolvedValue(undefined);
  });

  it("shows pending double-confirmation state with resend and cancel actions", async () => {
    vi.mocked(loadAccountSecurityState).mockResolvedValue({
      email: account.email,
      pendingEmail: "next@example.test",
      emailChangeSentAt: "2026-09-14T12:00:00.000Z",
      emailVerified: true,
    });
    render(<SecurityPage />);

    expect(await screen.findByText("Verify next@example.test")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    await waitFor(() => expect(resendAccountEmailChange).toHaveBeenCalledWith({}));
    fireEvent.click(screen.getByRole("button", { name: "Cancel change" }));
    await waitFor(() => expect(cancelAccountEmailChange).toHaveBeenCalledWith({}));
  });

  it("requires current, new, and matching confirmation before password change", async () => {
    render(<SecurityPage />);
    const passwordSection = await screen.findByRole("heading", { name: "Password" });
    const form = passwordSection.closest("section")!;
    fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(within(form).getByLabelText("New password"), { target: { value: "new-password" } });
    fireEvent.change(within(form).getByLabelText("Confirm password"), { target: { value: "new-password" } });
    fireEvent.click(within(form).getByRole("button", { name: /Change password/ }));
    await waitFor(() => expect(changeAccountPassword).toHaveBeenCalledWith({}, {
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmPassword: "new-password",
    }));
  });

  it("lists ownership blockers and disables account deletion", async () => {
    vi.mocked(loadAccountDeletionBlockers).mockResolvedValue([{
      kind: "active_membership",
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      workspace_name: "Meyhouse",
      role_name: "Owner",
      is_owner: true,
    }]);
    render(<SecurityPage />);
    expect(await screen.findByText(/Meyhouse: transfer ownership/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveProperty("disabled", true);
    expect(requestSecureAccountDeletion).not.toHaveBeenCalled();
  });
});
