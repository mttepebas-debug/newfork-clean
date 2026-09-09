import { fireEvent, render, screen } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesPage from "./PreferencesPage";

let account: AccountProfile | null;
const updateAccount = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account,
    updateAccount,
  }),
}));

describe("PreferencesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner User",
      phone: null,
      theme: "system",
    };
  });

  it("syncs clean preference state when the account refreshes", () => {
    const view = render(<PreferencesPage />);

    account = { ...account!, theme: "dark" };
    view.rerender(<PreferencesPage />);

    expect(
      (screen.getByRole("radio", { name: /dark/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("does not overwrite an unsaved theme choice during account refresh", () => {
    const view = render(<PreferencesPage />);

    fireEvent.click(screen.getByRole("radio", { name: /light/i }));
    account = { ...account!, theme: "dark" };
    view.rerender(<PreferencesPage />);

    expect(
      (screen.getByRole("radio", { name: /light/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});
