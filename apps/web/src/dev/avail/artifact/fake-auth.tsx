// Stands in for auth/AuthContext in the AVAIL-TASARIM artifact bundle only (build.mjs swaps it in).
import type { ActiveWorkspaceContext } from "@newfork/shared";
import type { ReactNode } from "react";
import { useLocation } from "react-router";

export type SignUpResult = false | "signed_in" | "email_confirmation_required";

const workspaceId = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const userId = "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5";

function contextFor(role: "owner" | "employee"): ActiveWorkspaceContext {
  return {
    userId,
    workspace: {
      id: workspaceId,
      name: "Meyhouse",
      logo_url: null,
      logo_file_name: null,
      logo_updated_at: null,
      schedule_logo_placement: { scale: 1, offset_x: 0, offset_y: 0 },
    },
    membership: { id: "bd6b757b-c9ad-4e47-a47e-0a90a43bc0e4", userId, workspaceId, role, status: "active", allLocations: role === "owner" },
    permissions:
      role === "owner"
        ? [
            "workspace.read",
            "workspace.manage",
            "schedule.read",
            "schedule.time_off_requests.read",
            "employees.read",
            "employee_documents.read",
            "availability.read",
            "important_dates.read",
            "announcements.read",
            "announcements.manage",
            "notifications.read",
          ]
        : ["workspace.read", "announcements.read", "notifications.read"],
    actions: role === "owner" ? ["employee_hub.read"] : [],
    onboarding: { status: "complete", currentStep: 2 },
    documentAccess: { restricted: false },
    locationScope: { allLocations: role === "owner", locationIds: [] },
  } as unknown as ActiveWorkspaceContext;
}

const owner = contextFor("owner");
const employee = contextFor("employee");

// S4 is the employee's screen: the shell turns into the employee's there.
export function useAuth() {
  const { pathname } = useLocation();
  const context = pathname.endsWith("/s4") ? employee : owner;
  return {
    account: null,
    authenticated: true,
    context,
    error: null,
    ready: true,
    supabaseConfigured: false,
    signIn: async () => false,
    signUp: async (): Promise<SignUpResult> => false,
    refresh: async () => context,
    signOut: async () => {},
    updateAccount: async () => {},
  };
}

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  return children;
}
