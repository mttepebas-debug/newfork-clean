import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@newfork/ui";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import {
  PermissionRoute,
  settingsEntryPermissions,
} from "./auth/PermissionRoute";
import { appLandingPath } from "./auth/routeDestinations";
import { AppShell } from "./shell/AppShell";
import { SignInPage } from "./views/SignInPage";
import "./styles.css";

const AccountLayout = lazy(() => import("./account/AccountLayout"));
const PublicTrustLayout = lazy(() => import("./public/PublicTrustLayout"));
const PrivacyPage = lazy(() =>
  import("./public/PublicTrustPages").then((module) => ({
    default: module.PrivacyPage,
  })),
);
const TermsPage = lazy(() =>
  import("./public/PublicTrustPages").then((module) => ({
    default: module.TermsPage,
  })),
);
const AccessibilityPage = lazy(() =>
  import("./public/PublicTrustPages").then((module) => ({
    default: module.AccessibilityPage,
  })),
);
const ContactPage = lazy(() =>
  import("./public/PublicTrustPages").then((module) => ({
    default: module.ContactPage,
  })),
);
const PrivacyChoicesPage = lazy(() =>
  import("./public/PublicTrustPages").then((module) => ({
    default: module.PrivacyChoicesPage,
  })),
);
const PreferencesPage = lazy(() => import("./account/PreferencesPage"));
const ProfilePage = lazy(() => import("./account/ProfilePage"));
const WorkspacesPage = lazy(() => import("./account/WorkspacesPage"));
const EmployeeHubPage = lazy(() => import("./views/EmployeeHubPage"));
const KioskPage = lazy(() => import("./kiosk/KioskPage"));
const WorkspacePage = lazy(() => import("./views/WorkspacePage"));
const AnnouncementsPage = lazy(() => import("./views/AnnouncementsPage"));
const NotificationsPage = lazy(() => import("./views/NotificationsPage"));
const EmployeesPage = lazy(() => import("./employees/EmployeesPage"));
const AcceptInvitationPage = lazy(
  () => import("./employees/AcceptInvitationPage"),
);
const EmployeeOnboardingPage = lazy(
  () => import("./employees/EmployeeOnboardingPage"),
);
const OwnerOnboardingPage = lazy(() => import("./views/OwnerOnboardingPage"));
const SchedulePage = lazy(() => import("./views/SchedulePage"));
const ScheduleShiftDesignPage = lazy(
  () => import("./dev/ScheduleShiftDesignPage"),
);
const ScheduleTemplatesPage = lazy(
  () => import("./views/ScheduleTemplatesPage"),
);
const AvailabilityPage = lazy(() =>
  import("./views/AvailabilityPage").then((module) => ({
    default: module.AvailabilityPage,
  })),
);
const TimeEntriesPage = lazy(() => import("./views/TimeEntriesPage"));
const LineupPage = lazy(() => import("./views/LineupPage"));
const ScheduleRequestsPage = lazy(() => import("./views/ScheduleRequestsPage"));
const SettingsLayout = lazy(() => import("./settings/SettingsLayout"));
const GeneralSettingsPage = lazy(
  () => import("./settings/GeneralSettingsPage"),
);
const LocationsSettingsPage = lazy(
  () => import("./settings/LocationsSettingsPage"),
);
const JobsSettingsPage = lazy(() => import("./settings/JobsSettingsPage"));
const SchedulingSettingsPage = lazy(
  () => import("./settings/SchedulingSettingsPage"),
);
const ShiftTypesSettingsPage = lazy(
  () => import("./settings/ShiftTypesSettingsPage"),
);
const ImportantDatesSettingsPage = lazy(
  () => import("./settings/ImportantDatesSettingsPage"),
);
const RolesSettingsPage = lazy(() => import("./settings/RolesSettingsPage"));
const DocumentsSettingsPage = lazy(
  () => import("./settings/DocumentsSettingsPage"),
);
const SignatureTemplatesSettingsPage = lazy(
  () => import("./settings/SignatureTemplatesSettingsPage"),
);
const SupportSettingsPage = lazy(
  () => import("./settings/SupportSettingsPage"),
);
const KioskSettingsPage = lazy(() => import("./settings/KioskSettingsPage"));
const SettingsHomeRedirect = lazy(
  () => import("./settings/SettingsHomeRedirect"),
);

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30_000 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={appQueryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Toaster />
          <Suspense
            fallback={
              <main className="auth-loading" aria-label="Loading page" />
            }
          >
            <Routes>
              <Route element={<PublicTrustLayout />}>
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/accessibility" element={<AccessibilityPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route
                  path="/your-privacy-choices"
                  element={<PrivacyChoicesPage />}
                />
              </Route>
              <Route path="/sign-in" element={<SignInPage />} />
              {import.meta.env.DEV ? (
                <Route
                  path="/dev/schedule-shift-design"
                  element={<ScheduleShiftDesignPage />}
                />
              ) : null}
              <Route path="/kiosk" element={<KioskPage />} />
              <Route path="/accept-invite" element={<AcceptInvitationPage />} />
              <Route path="/invite/accept" element={<AcceptInvitationPage />} />
              <Route
                path="/welcome/*"
                element={
                  <ProtectedRoute>
                    <EmployeeOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute workspace="any">
                    <OwnerOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/account"
                element={
                  <ProtectedRoute>
                    <AccountLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="profile" replace />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="preferences" element={<PreferencesPage />} />
                <Route path="workspaces" element={<WorkspacesPage />} />
              </Route>
              <Route
                path="/app"
                element={
                  <ProtectedRoute workspace="complete">
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<AppHomeRedirect />} />
                <Route
                  path="workspace"
                  element={
                    <PermissionRoute
                      anyOf={["workspace.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <WorkspacePage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <SchedulePage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/export"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.export", "schedule.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <SchedulePage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/templates"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.templates.manage", "schedule.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <ScheduleTemplatesPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="time-entries"
                  element={
                    <PermissionRoute
                      anyOf={["time.read.location"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <TimeEntriesPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/lineup"
                  element={
                    <PermissionRoute anyOf={["schedule.lineup.read"]}>
                      <LineupPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/requests"
                  element={
                    <PermissionRoute
                      anyOf={[
                        "schedule.time_off_requests.read",
                        "schedule.shift_change_requests.read",
                      ]}
                    >
                      <ScheduleRequestsPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="availability"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <AvailabilityPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="important-dates"
                  element={
                    <PermissionRoute
                      anyOf={["workspace.manage", "schedule.read"]}
                    >
                      <ImportantDatesSettingsPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="employees"
                  element={
                    <PermissionRoute anyOf={["employees.read"]}>
                      <EmployeesPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="employees/archive"
                  element={
                    <PermissionRoute anyOf={["employees.read"]}>
                      <EmployeesPage />
                    </PermissionRoute>
                  }
                />
                <Route path="employee-hub/*" element={<EmployeeHubPage />} />
                <Route
                  path="announcements"
                  element={
                    <PermissionRoute anyOf={["announcements.read"]}>
                      <AnnouncementsPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="announcements/:announcementId"
                  element={
                    <PermissionRoute anyOf={["announcements.read"]}>
                      <AnnouncementsPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="notifications"
                  element={
                    <PermissionRoute anyOf={["notifications.read"]}>
                      <NotificationsPage />
                    </PermissionRoute>
                  }
                />
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsHomeRedirect />} />
                  <Route
                    path="general"
                    element={
                      <PermissionRoute anyOf={["workspace.manage"]}>
                        <GeneralSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="locations"
                    element={
                      <PermissionRoute anyOf={["workspace.manage"]}>
                        <LocationsSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="jobs"
                    element={
                      <PermissionRoute anyOf={["workspace.manage"]}>
                        <JobsSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling"
                    element={
                      <PermissionRoute anyOf={["workspace.manage"]}>
                        <SchedulingSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-types"
                    element={
                      <PermissionRoute anyOf={["workspace.manage"]}>
                        <ShiftTypesSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="important-dates"
                    element={<Navigate to="/app/important-dates" replace />}
                  />
                  <Route
                    path="closed-days"
                    element={<Navigate to="/app/important-dates" replace />}
                  />
                  <Route
                    path="important-dates/closed-days"
                    element={<Navigate to="/app/important-dates" replace />}
                  />
                  <Route
                    path="roles"
                    element={
                      <PermissionRoute anyOf={["roles.read"]}>
                        <RolesSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="roles/:roleId"
                    element={
                      <PermissionRoute anyOf={["roles.read"]}>
                        <RolesSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="documents"
                    element={
                      <PermissionRoute anyOf={["documents.read"]}>
                        <DocumentsSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="acknowledgements"
                    element={
                      <PermissionRoute anyOf={["signature_templates.read"]}>
                        <SignatureTemplatesSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="kiosk"
                    element={
                      <PermissionRoute
                        anyOf={[
                          "kiosk.device.enroll.location",
                          "kiosk.device.read.location",
                          "kiosk.device.revoke.location",
                          "kiosk.pin.reset.location",
                          "kiosk.audit.read.location",
                        ]}
                      >
                        <KioskSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="support"
                    element={
                      <PermissionRoute anyOf={settingsEntryPermissions}>
                        <SupportSettingsPage />
                      </PermissionRoute>
                    }
                  />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AppHomeRedirect() {
  const { context } = useAuth();
  return <Navigate to={appLandingPath(context)} replace />;
}
