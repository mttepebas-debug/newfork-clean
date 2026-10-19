import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountProfile } from "@newfork/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PreferencesPage from "./PreferencesPage";
import { requestAppNavigation } from "../shell/leave-guard";

let account: AccountProfile | null;
const updateAccount = vi.fn(async () => undefined);

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    account,
    updateAccount,
  }),
}));

const dateFormat = () => screen.getByLabelText(/Date format/) as HTMLSelectElement;

describe("PreferencesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    account = {
      userId: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5",
      email: "owner@example.test",
      displayName: "Owner User",
      phone: null,
      theme: "dark",
      timeFormat: "system",
      dateFormat: "system",
    };
  });

  it("shows Discard and opens Save only while a choice differs from the stored one", () => {
    render(<PreferencesPage />);
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    fireEvent.change(dateFormat(), { target: { value: "YYYY-MM-DD" } });
    expect(screen.getByRole("button", { name: "Discard" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false);
    fireEvent.change(dateFormat(), { target: { value: "system" } });
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
  });

  it("offers no appearance choice", () => {
    render(<PreferencesPage />);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Appearance")).toBeNull();
  });

  it("retains changes on Stay and restores them on Discard navigation", () => {
    render(<PreferencesPage />);
    fireEvent.change(dateFormat(), { target: { value: "YYYY-MM-DD" } });
    const navigate = vi.fn();
    act(() => requestAppNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Stay here" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(dateFormat().value).toBe("YYYY-MM-DD");
    act(() => requestAppNavigation(navigate));
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(dateFormat().value).toBe("system");
    expect(navigate).toHaveBeenCalledOnce();
    expect(updateAccount).not.toHaveBeenCalled();
  });

  it("keeps the stored theme value when saving formats", async () => {
    render(<PreferencesPage />);
    fireEvent.change(dateFormat(), { target: { value: "YYYY-MM-DD" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(updateAccount).toHaveBeenCalledWith("Owner User", "dark", null, {
        timeFormat: "system",
        dateFormat: "YYYY-MM-DD",
      }),
    );
  });

  it("syncs clean preference state when the account refreshes", () => {
    const view = render(<PreferencesPage />);
    account = { ...account!, dateFormat: "DD-MM-YYYY" };
    view.rerender(<PreferencesPage />);
    expect(dateFormat().value).toBe("DD-MM-YYYY");
  });

  it("does not overwrite an unsaved choice during account refresh", () => {
    const view = render(<PreferencesPage />);
    fireEvent.change(dateFormat(), { target: { value: "YYYY-MM-DD" } });
    account = { ...account!, dateFormat: "DD-MM-YYYY" };
    view.rerender(<PreferencesPage />);
    expect(dateFormat().value).toBe("YYYY-MM-DD");
  });
});
