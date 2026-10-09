import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// BL-137 D1: a reset link opens a session before the new password is saved.
// A marker in localStorage says so; if the tab closes in between, the next
// load of the app drops that session before the auth client can read it.

const pendingKey = "newfork.passwordResetPending";

const auth = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({ auth }),
}));

async function loadLib() {
  vi.resetModules();
  return import("./supabase");
}

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:55321");
  vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  auth.verifyOtp.mockReset();
  auth.updateUser.mockReset();
  auth.signOut.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("the reset session marker", () => {
  it("is set when the link opens a session", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    const lib = await loadLib();

    expect(await lib.openPasswordResetSession("hash-1")).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-1" });
    expect(window.localStorage.getItem(pendingKey)).toBe("1");
  });

  it("is not set when the link is refused", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { session: null },
      error: new Error("Email link is invalid or has expired"),
    });
    const lib = await loadLib();

    expect(await lib.openPasswordResetSession("hash-1")).toBe(false);
    expect(window.localStorage.getItem(pendingKey)).toBeNull();
  });

  it("is cleared when the new password is saved, and kept when it is refused", async () => {
    window.localStorage.setItem(pendingKey, "1");
    // Import first: a marker present at load time is the closed-tab case.
    const lib = await loadLib();
    window.localStorage.setItem(pendingKey, "1");

    auth.updateUser.mockResolvedValueOnce({ data: {}, error: new Error("Password is too weak") });
    await expect(lib.saveNewPassword("short-one")).rejects.toThrow("Password is too weak");
    expect(window.localStorage.getItem(pendingKey)).toBe("1");

    auth.updateUser.mockResolvedValueOnce({ data: {}, error: null });
    await lib.saveNewPassword("new-password-1");
    expect(window.localStorage.getItem(pendingKey)).toBeNull();
  });

  it("is cleared and the session signed out when the person leaves without saving", async () => {
    const lib = await loadLib();
    window.localStorage.setItem(pendingKey, "1");
    await lib.abandonPasswordResetSession();
    expect(window.localStorage.getItem(pendingKey)).toBeNull();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("an abandoned password reset session", () => {
  it("is dropped on the next load, and other storage is left alone", async () => {
    window.localStorage.setItem(pendingKey, "1");
    window.localStorage.setItem("sb-127-auth-token", "{\"access_token\":\"x\"}");
    window.localStorage.setItem("newfork.other", "kept");

    await loadLib();

    expect(window.localStorage.getItem("sb-127-auth-token")).toBeNull();
    expect(window.localStorage.getItem(pendingKey)).toBeNull();
    expect(window.localStorage.getItem("newfork.other")).toBe("kept");
  });

  it("does not touch a normal session", async () => {
    window.localStorage.setItem("sb-127-auth-token", "{\"access_token\":\"x\"}");

    await loadLib();

    expect(window.localStorage.getItem("sb-127-auth-token")).not.toBeNull();
  });
});
