import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecurityPage, { deletionBlockerSummary } from "./SecurityPage";
import {
  cancelAccountEmailChange,
  changeAccountPassword,
  loadAccountDeletionBlockers,
  loadAccountSecurityState,
  requestSecureAccountDeletion,
  resendAccountEmailChange,
  signOutOtherAccountSessions,
} from "../lib/supabase";
import { RequestError } from "../lib/request-error";

const account: AccountProfile = {
  userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
  email: "owner@example.test",
  displayName: "Owner User",
  phone: null,
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
    expect(await screen.findByText("Not verified")).toBeTruthy();
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

  it("says the security details didn't load, without the raw error, and keeps deletion closed until they do", async () => {
    vi.mocked(loadAccountSecurityState).mockRejectedValueOnce(new Error("Gateway timeout"));
    render(<SecurityPage />);
    const line = await screen.findByRole("alert");
    expect(line.textContent).toContain("Your security details didn't load.");
    expect(screen.queryByText("Gateway timeout")).toBeNull();
    expect(screen.queryByText("Checking verification")).toBeNull();
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveProperty("disabled", true);
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Not verified")).toBeTruthy();
    expect(screen.queryByText(/didn't load/)).toBeNull();
    expect(loadAccountSecurityState).toHaveBeenCalledTimes(2);
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

  it.each([
    ["session.password_incorrect", 403, "Current password is incorrect", "That password did not match. Type it again."],
    ["session.password_required", 400, "Current password required", "Type your account password to continue."],
  ] as const)("answers %s with the Workspaces sentence, not the server's", async (reason, status, serverText, sentence) => {
    vi.mocked(signOutOtherAccountSessions).mockRejectedValue(new RequestError(serverText, reason, undefined, status));
    render(<SecurityPage />);
    const sessions = (await screen.findByRole("heading", { name: "Active sessions" })).closest("section")!;
    fireEvent.change(within(sessions).getByLabelText("Current password"), { target: { value: "wrong-password" } });
    fireEvent.click(within(sessions).getByRole("button", { name: /Sign out other sessions/ }));
    expect((await within(sessions).findByRole("alert")).textContent).toBe(sentence);
    expect(screen.queryByText(serverText)).toBeNull();
  });

  it.each(["Password", "Active sessions", "Delete your account?"])("answers a refusal from %s beside that form and nowhere else", async (where) => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
    const refusal = new RequestError("Current password is incorrect", "session.password_incorrect", undefined, 403);
    vi.mocked(changeAccountPassword).mockRejectedValue(refusal);
    vi.mocked(signOutOtherAccountSessions).mockRejectedValue(refusal);
    vi.mocked(requestSecureAccountDeletion).mockRejectedValue(refusal);
    render(<SecurityPage />);
    const section = (name: string) => screen.getByRole("heading", { name, hidden: true }).closest("section, dialog") as HTMLElement;
    await screen.findByText("Not verified");
    if (where === "Password") {
      const form = section("Password");
      fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "wrong" } });
      fireEvent.change(within(form).getByLabelText("New password"), { target: { value: "new-password" } });
      fireEvent.change(within(form).getByLabelText("Confirm password"), { target: { value: "new-password" } });
      fireEvent.click(within(form).getByRole("button", { name: /Change password/ }));
    } else if (where === "Active sessions") {
      const form = section("Active sessions");
      fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "wrong" } });
      fireEvent.click(within(form).getByRole("button", { name: /Sign out other sessions/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
      const dialog = screen.getByRole("dialog", { name: "Delete your account?" });
      fireEvent.change(within(dialog).getByLabelText("Current password"), { target: { value: "wrong" } });
      fireEvent.click(within(dialog).getByRole("button", { name: "Confirm account deletion" }));
    }
    const alert = await within(section(where)).findByRole("alert", { hidden: true });
    expect(alert.textContent).toBe("That password did not match. Type it again.");
    expect(screen.getAllByRole("alert", { hidden: true })).toHaveLength(1);
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

  it("says what stands in the way once, not once per workspace", async () => {
    vi.mocked(loadAccountDeletionBlockers).mockResolvedValue([{
      kind: "active_membership",
      workspace_id: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      workspace_name: "Meyhouse",
      role_name: "Owner",
      is_owner: true,
    }]);
    render(<SecurityPage />);
    expect(
      await screen.findByText(/you own 1 workspace, so hand it to somebody else/),
    ).toBeTruthy();
    // The list used to grow with the account, repeating one instruction.
    expect(screen.queryByText(/Meyhouse/)).toBeNull();
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveProperty("disabled", true);
    expect(requestSecureAccountDeletion).not.toHaveBeenCalled();
  });
});

describe("deletionBlockerSummary", () => {
  const membership = (name: string, owner: boolean) => ({
    kind: "active_membership" as const,
    workspace_id: name,
    workspace_name: name,
    role_name: owner ? "Owner" : "Employee",
    is_owner: owner,
  });

  it("counts instead of naming, and keeps the three answers apart", () => {
    expect(
      deletionBlockerSummary([
        membership("Meyhouse", true),
        membership("Ridgeline", true),
        membership("Juniper", false),
        {
          kind: "pending_ownership_transfer",
          workspace_id: "Juniper",
          workspace_name: "Juniper",
          is_owner: false,
          transfer_id: "9a3d5f0e-2b71-4f0a-9a52-6c4a1c9f1f22",
          transfer_direction: "outgoing",
        },
      ]),
    ).toBe(
      "Before you can delete your account: you own 2 workspaces, so hand them to somebody else in Account \u203a Workspaces; you still have access to 1 workspace you do not own, which an owner or an admin there has to remove; and 1 ownership transfer is still waiting for an answer.",
    );
  });

  it("does not say \"and\" when there is only one thing to do", () => {
    expect(deletionBlockerSummary([membership("Juniper", false)])).toBe(
      "Before you can delete your account: you still have access to 1 workspace you do not own, which an owner or an admin there has to remove.",
    );
  });
});
