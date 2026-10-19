import { DocumentsSettingsRoute } from "./documents/DocumentsSettingsRoute";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@newfork/ui";
import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { ActionRoute } from "./auth/ActionRoute";
import { EmployeeInterfaceRoute } from "./auth/EmployeeInterfaceRoute";
import { DesktopOnlyRoute } from "./auth/DesktopOnlyRoute";
import { PermissionRoute } from "./auth/PermissionRoute";
import { SettingsPageRoute } from "./settings/SettingsPageRoute";
import { appLandingPath, hubPath } from "./auth/resolveLanding";
import { AppShell } from "./shell/AppShell";
import { AppCrashBoundary } from "./shell/CrashBoundary";
import { TOAST_LAYER_ATTRIBUTE } from "./shell/toastLayer";
import { DocumentAccessRoute } from "./documents/DocumentAccessRoute";
import { OwnDocumentsRedirect, OwnDocumentsRoute } from "./documents/OwnDocumentsRoutes";
import { SignInPage } from "./views/SignInPage";
import "./styles.css";

import { NotificationsPage } from "./notifications/NotificationViews";
const AccountLayout = lazy(() => import("./account/AccountLayout"));
const AccountRecoveryPage = lazy(() => import("./account/AccountRecoveryPage"));
const ForgotPasswordPage = lazy(() => import("./views/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./views/ResetPasswordPage"));
// DEV pages are gated at the import, not only the route: a lazy() import that
// exists in production code still ships its chunk.
const EmployeeOnboardingPreview = import.meta.env.DEV
  ? lazy(() => import("./dev/EmployeeOnboardingPreview"))
  : () => null;
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
const NotificationPreferencesPage = lazy(
  () => import("./notification-settings/NotificationPreferencesPage"),
);
const WorkspaceNotificationSettingsPage = lazy(
  () => import("./notification-settings/WorkspaceNotificationSettingsPage"),
);
const ProfilePage = lazy(() => import("./account/ProfilePage"));
const SecurityPage = lazy(() => import("./account/SecurityPage"));
const WorkspacesPage = lazy(() => import("./account/WorkspacesPage"));
const MyDocumentsPage = lazy(() => import("./documents/MyDocumentsPage"));
const WorkspaceHubPage = lazy(() => import("./shell/WorkspaceHubPage"));
const WorkspaceStatusPage = lazy(() => import("./shell/WorkspaceStatusPage"));
const EmployeeHubPage = lazy(() => import("./views/EmployeeHubPage"));
const WorkspacePage = lazy(() => import("./views/WorkspacePage"));
const AnnouncementsPage = lazy(() => import("./views/AnnouncementsPage"));
const ImportantDatesPage = lazy(() => import("./views/ImportantDatesPage"));
const EmployeeDocumentsPage = lazy(() => import("./documents/EmployeeDocumentsPage"));
const EmployeesPage = lazy(() => import("./employees/EmployeesPage"));
const AcceptInvitationPage = lazy(
  () => import("./employees/AcceptInvitationPage"),
);
const EmployeeOnboardingPage = lazy(
  () => import("./employees/EmployeeOnboardingPage"),
);
const WelcomeRedirect = lazy(() => import("./employees/WelcomeRedirect"));
const OwnerOnboardingPage = lazy(() => import("./views/OwnerOnboardingPage"));
const SchedulePage = lazy(() => import("./views/SchedulePage"));
const ScheduleShiftDesignPage = import.meta.env.DEV
  ? lazy(() => import("./dev/ScheduleShiftDesignPage"))
  : () => null;
const ScheduleShiftBadgeLabPage = import.meta.env.DEV
  ? lazy(() => import("./dev/ScheduleShiftBadgeLabPage"))
  : () => null;
const FeedbackGalleryPage = import.meta.env.DEV
  ? lazy(() => import("./dev/FeedbackGalleryPage"))
  : () => null;
const AvailabilityPage = lazy(() =>
  import("./views/AvailabilityPage").then((module) => ({
    default: module.AvailabilityPage,
  })),
);
const ScheduleRequestsPage = lazy(() => import("./views/ScheduleRequestsPage"));
const LineupPage = lazy(() => import("./views/LineupPage"));
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
const ConflictHandlingSettingsPage = lazy(
  () => import("./settings/ConflictHandlingSettingsPage"),
);
const ShiftCatalogSettingsPage = lazy(
  () => import("./settings/ShiftCatalogSettingsPage"),
);
const RolesSettingsPage = lazy(() => import("./settings/RolesSettingsPage"));

const SignatureTemplatesSettingsPage = lazy(
  () => import("./settings/SignatureTemplatesSettingsPage"),
);
const SupportSettingsPage = lazy(
  () => import("./settings/SupportSettingsPage"),
);
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
        {/* A crash outside the shell's page area (the shell itself, Account,
            sign-in) fills the screen with the error card instead of a white
            page (BL-1075); inside the shell, PageCrashBoundary answers first. */}
        <AppCrashBoundary>
        <AuthProvider queryClient={appQueryClient}>
          {createPortal(
            <div {...{ [TOAST_LAYER_ATTRIBUTE]: "" }}>
              <Toaster />
            </div>,
            document.body,
          )}
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
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route
                path="/account-recovery"
                element={<AccountRecoveryPage />}
              />
              {import.meta.env.DEV ? (
                <>
                  <Route
                    path="/dev/schedule-shift-design"
                    element={<ScheduleShiftDesignPage />}
                  />
                  <Route
                    path="/dev/feedback"
                    element={<FeedbackGalleryPage />}
                  />
                  <Route
                    path="/dev/employee-onboarding"
                    element={<EmployeeOnboardingPreview />}
                  />
                  <Route
                    path="/dev/schedule-shift-badge-lab"
                    element={<Navigate to="/app/schedule-badge-lab" replace />}
                  />
                </>
              ) : null}
              <Route path="/accept-invite" element={<AcceptInvitationPage />} />
              <Route path="/invite/accept" element={<AcceptInvitationPage />} />
              {/* One hub replaced three routes that each knew a third of it. */}
              <Route
                path={hubPath}
                element={
                  <ProtectedRoute>
                    <WorkspaceHubPage />
                  </ProtectedRoute>
                }
              />
              {["/invitations/pending", "/no-organization", "/organization-switcher"].map(
                (retired) => (
                  <Route
                    key={retired}
                    path={retired}
                    element={<Navigate to={hubPath} replace />}
                  />
                ),
              )}
              <Route
                path="/welcome/:workspaceId/*"
                element={
                  <ProtectedRoute>
                    <EmployeeOnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/welcome"
                element={
                  <ProtectedRoute>
                    <WelcomeRedirect />
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
                path="/workspaces/status/:workspaceId"
                element={
                  <ProtectedRoute>
                    <WorkspaceStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workspaces/status"
                element={
                  <ProtectedRoute>
                    <WorkspaceStatusPage />
                  </ProtectedRoute>
                }
              />
              {["/workspaces/suspended", "/organization-switcher/suspended"].map(
                (retired) => (
                  <Route
                    key={retired}
                    path={`${retired}/*`}
                    element={<Navigate to="/workspaces/status" replace />}
                  />
                ),
              )}
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
                <Route path="security" element={<SecurityPage />} />
                <Route path="preferences" element={<PreferencesPage />} />
                <Route
                  path="preferences/notifications"
                  element={<NotificationPreferencesPage />}
                />
                <Route path="workspaces" element={<WorkspacesPage />} />
                {/* Account → Documents moved to the app (MY-DOCUMENTS); its old address still opens it. */}
                <Route path="documents" element={<OwnDocumentsRedirect />} />
              </Route>
              <Route
                path="/app"
                element={
                  <ProtectedRoute workspace="complete">
                    <DocumentAccessRoute>
                      <AppShell />
                    </DocumentAccessRoute>
                  </ProtectedRoute>
                }
              >
                <Route index element={<AppHomeRedirect />} />
                <Route
                  path="workspace"
                  element={
                    <PermissionRoute
                      anyOf={["workspace.read"]}
                      management
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
                      management
                    >
                      <DesktopOnlyRoute message="Schedule is available on a computer.">
                        <SchedulePage />
                      </DesktopOnlyRoute>
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/export"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.export", "schedule.read"]}
                      management
                    >
                      <DesktopOnlyRoute message="Schedule is available on a computer.">
                        <SchedulePage />
                      </DesktopOnlyRoute>
                    </PermissionRoute>
                  }
                />
                <Route
                  path="schedule/templates"
                  element={
                    <PermissionRoute
                      anyOf={["schedule.templates.read"]}
                      management
                    >
                      <DesktopOnlyRoute message="Schedule is available on a computer.">
                        <SchedulePage />
                      </DesktopOnlyRoute>
                    </PermissionRoute>
                  }
                />
                {import.meta.env.DEV ? (
                  <>
                    <Route
                      path="schedule-badge-lab"
                      element={
                        <PermissionRoute
                          anyOf={["schedule.read"]}
                          management
                        >
                          <ScheduleShiftBadgeLabPage />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="schedule-badge-lab/export"
                      element={
                        <PermissionRoute
                          anyOf={["schedule.export", "schedule.read"]}
                          management
                        >
                          <ScheduleShiftBadgeLabPage />
                        </PermissionRoute>
                      }
                    />
                    <Route
                      path="schedule-badge-lab/templates"
                      element={
                        <PermissionRoute
                          anyOf={["schedule.templates.read"]}
                          management
                        >
                          <ScheduleShiftBadgeLabPage />
                        </PermissionRoute>
                      }
                    />
                  </>
                ) : null}
                <Route
                  path="schedule/requests"
                  element={<ScheduleRequestsPage />}
                />
                <Route
                  path="schedule/lineup"
                  element={
                    <ActionRoute action="schedule.read">
                      <LineupPage />
                    </ActionRoute>
                  }
                />
                <Route
                  path="availability"
                  element={
                    <PermissionRoute
                      anyOf={["availability.read"]}
                      management
                    >
                      <AvailabilityPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="important-dates"
                  element={<Navigate to="/app/announcements/important-dates" replace />}
                />
                <Route
                  path="employees"
                  element={
                    <PermissionRoute anyOf={["employees.read"]}>
                      <EmployeesPage />
                    </PermissionRoute>
                  }
                />
                <Route path="employees/documents" element={<ActionRoute action="documents.read"><EmployeeDocumentsPage /></ActionRoute>} />
                <Route
                  path="employees/archive"
                  element={
                    <PermissionRoute anyOf={["employees.read"]}>
                      <EmployeesPage />
                    </PermissionRoute>
                  }
                />
                {/* One's own documents, a page of its own in either interface (MY-DOCUMENTS, Mert 2026-10-19). */}
                <Route
                  path="employee-hub/documents"
                  element={
                    <OwnDocumentsRoute view="employee">
                      <MyDocumentsPage title="Documents" />
                    </OwnDocumentsRoute>
                  }
                />
                <Route
                  path="my-documents"
                  element={
                    <OwnDocumentsRoute view="management">
                      <MyDocumentsPage title="My documents" />
                    </OwnDocumentsRoute>
                  }
                />
                <Route
                  path="employee-hub/*"
                  element={
                    // Whoever the core lets read their own hub, whatever
                    // their role (FB-6.2 .7b, KK-35 S4); somebody who only
                    // manages goes to their landing page (ROL-CIFT 6.2).
                    <EmployeeInterfaceRoute>
                      <EmployeeHubPage />
                    </EmployeeInterfaceRoute>
                  }
                />
                <Route path="notifications" element={<ActionRoute action="notifications.read_own"><NotificationsPage /></ActionRoute>} />
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
                {/* Important Dates is a page under Announcements (EKRAN-08). */}
                <Route
                  path="announcements/important-dates"
                  element={
                    <ActionRoute action="settings.important_dates.read">
                      <ImportantDatesPage />
                    </ActionRoute>
                  }
                />
                <Route
                  path="announcements/important-dates/:announcementId"
                  element={
                    <ActionRoute action="settings.important_dates.read">
                      <ImportantDatesPage />
                    </ActionRoute>
                  }
                />
                <Route
                  path="account/security"
                  element={<Navigate to="/account/security" replace />}
                />
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsHomeRedirect />} />
                  <Route
                    path="general"
                    element={
                      <SettingsPageRoute page="general">
                        <GeneralSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="locations"
                    element={
                      <SettingsPageRoute page="locations">
                        <LocationsSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="jobs"
                    element={
                      <SettingsPageRoute page="jobs">
                        <JobsSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="notifications"
                    element={
                      <SettingsPageRoute page="notifications">
                        <WorkspaceNotificationSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="scheduling"
                    element={
                      <SettingsPageRoute page="scheduling">
                        <SchedulingSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="scheduling/conflicts"
                    element={
                      <SettingsPageRoute page="conflicts">
                        <ConflictHandlingSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-types"
                    element={
                      <SettingsPageRoute page="shiftCatalog">
                        <ShiftCatalogSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-labels"
                    element={
                      <SettingsPageRoute page="shiftCatalog">
                        <ShiftCatalogSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-label"
                    element={
                      <Navigate
                        to="/app/settings/scheduling/shift-labels"
                        replace
                      />
                    }
                  />
                  <Route
                    path="important-dates"
                    element={<Navigate to="/app/announcements/important-dates" replace />}
                  />
                  <Route
                    path="closed-days"
                    element={<Navigate to="/app/announcements/important-dates" replace />}
                  />
                  <Route
                    path="important-dates/closed-days"
                    element={<Navigate to="/app/announcements/important-dates" replace />}
                  />
                  <Route
                    path="roles"
                    element={
                      <SettingsPageRoute page="roles">
                        <RolesSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="roles/:roleId"
                    element={
                      <SettingsPageRoute page="roles">
                        <RolesSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="documents"
                    element={<DocumentsSettingsRoute />}
                  />
                  <Route
                    path="acknowledgements"
                    element={
                      <SettingsPageRoute page="acknowledgements">
                        <SignatureTemplatesSettingsPage />
                      </SettingsPageRoute>
                    }
                  />
                  <Route
                    path="support"
                    // SettingsLayout already lets in only who may enter Settings.
                    element={<SupportSettingsPage />}
                  />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
        </AppCrashBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AppHomeRedirect() {
  const { context } = useAuth();
  return <Navigate to={appLandingPath(context)} replace />;
}
