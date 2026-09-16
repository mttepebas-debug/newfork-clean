import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

const flags = vi.hoisted(() => ({ developmentIdentityAllowed: true }));

vi.mock("../lib/supabase", () => ({
  applyThemePreference: vi.fn(),
  clearTabWorkspaceId: vi.fn(),
  developmentBearerToken: vi.fn(() => null),
  get developmentIdentityAllowed() {
    return flags.developmentIdentityAllowed;
  },
  developmentIdentityRoleStorageKey: "newfork.development.workspaceRole",
  getTabWorkspaceId: vi.fn(() => null),
  loadAccountProfile: vi.fn(),
  resolveWorkspaceContext: vi.fn(),
  saveAccountProfile: vi.fn(),
  supabaseClient: null,
}));

function RoleProbe() {
  const { context, ready } = useAuth();
  if (!ready) return <p>Loading</p>;
  return <p>{context ? `Role: ${context.membership.role}` : "Signed out"}</p>;
}

describe("AuthProvider without Supabase configuration", () => {
  beforeEach(() => {
    window.localStorage.setItem("newfork.development.workspaceRole", "manager");
  });

  it("restores the stored development role when development identity is allowed", async () => {
    flags.developmentIdentityAllowed = true;
    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Role: manager")).toBeTruthy();
  });

  it("ignores the stored development role outside development", async () => {
    flags.developmentIdentityAllowed = false;
    render(
      <AuthProvider>
        <RoleProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText("Signed out")).toBeTruthy();
  });
});
