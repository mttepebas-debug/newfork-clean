import { afterEach, describe, expect, it, vi } from "vitest";

// BL-137 D1: a reset link opens a session before the new password is saved.
// If the tab closes in between, the next load of the app drops that session
// before the auth client can read it.
describe("an abandoned password reset session", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("is dropped on the next load, and other storage is left alone", async () => {
    window.localStorage.setItem("newfork.passwordResetPending", "1");
    window.localStorage.setItem("sb-127-auth-token", "{\"access_token\":\"x\"}");
    window.localStorage.setItem("newfork.other", "kept");

    vi.resetModules();
    await import("./supabase");

    expect(window.localStorage.getItem("sb-127-auth-token")).toBeNull();
    expect(window.localStorage.getItem("newfork.passwordResetPending")).toBeNull();
    expect(window.localStorage.getItem("newfork.other")).toBe("kept");
  });

  it("does not touch a normal session", async () => {
    window.localStorage.setItem("sb-127-auth-token", "{\"access_token\":\"x\"}");

    vi.resetModules();
    await import("./supabase");

    expect(window.localStorage.getItem("sb-127-auth-token")).not.toBeNull();
  });
});
