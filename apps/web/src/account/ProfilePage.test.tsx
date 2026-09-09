import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./ProfilePage";
import { requestAccountDeletion } from "../lib/supabase";

let account: AccountProfile;
const signOut = vi.fn(async () => undefined);
const updateAccount = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account,
    signOut,
    updateAccount,
  }),
}));

vi.mock("../lib/supabase", () => ({
  supabaseClient: {},
  requestAccountDeletion: vi.fn(),
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner User",
      phone: null,
      theme: "system",
    };
    vi.mocked(requestAccountDeletion).mockResolvedValue(undefined);
  });

  it("requires exact email confirmation and acknowledgement before account deletion", async () => {
    render(<ProfilePage />);

    const deletionRegion = screen.getByRole("region", {
      name: "Delete account",
    });
    expect(deletionRegion.getAttribute("aria-describedby")).toBe(
      "account-deletion-description",
    );
    expect(
      document.getElementById("account-deletion-description")?.textContent,
    ).toContain("14-day restore window");

    const submitButton = screen.getByRole("button", {
      name: "Delete account",
    });
    expect(submitButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Type account email"), {
      target: { value: "wrong@example.test" },
    });
    fireEvent.click(
      screen.getByLabelText(/I understand account deletion can remove this login/),
    );
    expect(submitButton).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText("Type account email"), {
      target: { value: "owner@example.test" },
    });
    fireEvent.click(submitButton);

    await waitFor(() =>
      expect(requestAccountDeletion).toHaveBeenCalledWith(
        {},
        {
          typedEmail: "owner@example.test",
          acknowledged: true,
        },
      ),
    );
    expect(signOut).toHaveBeenCalled();
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
