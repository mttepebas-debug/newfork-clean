import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const supabase = vi.hoisted(() => ({
  signUp: vi.fn(),
  resolveWorkspaceContext: vi.fn(async () => null),
  loadAccountProfile: vi.fn(async () => null),
  saveAccountProfile: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  clearTabWorkspaceId: () => undefined,
  ensureSessionAlive: async () => true,
  loadAccountProfile: supabase.loadAccountProfile,
  saveAccountProfile: supabase.saveAccountProfile,
  resolveWorkspaceContext: supabase.resolveWorkspaceContext,
  sessionExpiredStorageKey: "newfork.session-expired",
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signUp: supabase.signUp,
    },
  },
}));

async function signUpThrough(): Promise<ReturnType<typeof useAuth>["signUp"]> {
  let captured: ReturnType<typeof useAuth> | null = null;
  function Probe() {
    captured = useAuth();
    return null;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(captured?.ready).toBe(true));
  return captured!.signUp;
}

describe("AuthContext sign-up (SEC-003 #9)", () => {
  beforeEach(() => {
    supabase.signUp.mockReset();
    supabase.saveAccountProfile.mockReset();
  });

  it("says the email must be confirmed when sign-up returns no session", async () => {
    supabase.signUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      "email_confirmation_required",
    );
    // Nothing is written for an account that cannot sign in yet.
    expect(supabase.signUp).toHaveBeenCalledWith({
      email: "new@example.test",
      password: "long-password",
    });
    expect(supabase.saveAccountProfile).not.toHaveBeenCalled();
  });

  it("says signed_in when sign-up returns a session", async () => {
    supabase.signUp.mockResolvedValue({
      data: {
        user: { id: "u1" },
        session: { user: { id: "u1", email: "new@example.test" } },
      },
      error: null,
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      "signed_in",
    );
  });

  it("answers false when sign-up is refused", async () => {
    supabase.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    });
    const signUp = await signUpThrough();

    await expect(signUp("new@example.test", "long-password")).resolves.toBe(
      false,
    );
  });
});
