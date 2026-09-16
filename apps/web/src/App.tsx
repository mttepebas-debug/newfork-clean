import { DocumentsSettingsRoute } from "./documents/DocumentsSettingsRoute";
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
import { DocumentNotificationRedirect } from "./documents/DocumentNotificationRedirect";
import { DocumentAccessRoute } from "./documents/DocumentAccessRoute";
import { SignInPage } from "./views/SignInPage";
import { postMvpSurfaces } from "./lib/post-mvp";
import "./styles.css";
import "./dark-theme.css";

const AccountLayout = lazy(() => import("./account/AccountLayout"));
const AccountRecoveryPage = lazy(() => import("./account/AccountRecoveryPage"));
const EmployeeOnboardingPreview = lazy(
  () => import("./dev/EmployeeOnboardingPreview"),
);
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
  () => import("./account/NotificationPreferencesPage"),
);
const ProfilePage = lazy(() => import("./account/ProfilePage"));
const SecurityPage = lazy(() => import("./account/SecurityPage"));
const WorkspacesPage = lazy(() => import("./account/WorkspacesPage"));
const AccountDocumentsPage = lazy(
  () => import("./account/AccountDocumentsPage"),
);
const OrganizationSwitcherPage = lazy(
  () => import("./shell/OrganizationSwitcherPage"),
);
const NoOrganizationPage = lazy(() => import("./shell/NoOrganizationPage"));
const PendingOrganizationStatusPage = lazy(
  () => import("./shell/PendingOrganizationStatusPage"),
);
const SuspendedOrganizationStatusPage = lazy(
  () => import("./shell/SuspendedOrganizationStatusPage"),
);
const EmployeeHubPage = lazy(() => import("./views/EmployeeHubPage"));
const KioskPage = lazy(() => import("./kiosk/KioskPage"));
const WorkspacePage = lazy(() => import("./views/WorkspacePage"));
const AnnouncementsPage = lazy(() => import("./views/AnnouncementsPage"));
const NotificationsPage = lazy(() => import("./views/NotificationsPage"));
const EmployeeDocumentsPage = lazy(() => import("./documents/EmployeeDocumentsPage"));
const EmployeesPage = lazy(() => import("./employees/EmployeesPage"));
const AcceptInvitationPage = lazy(
  () => import("./employees/AcceptInvitationPage"),
);
const PendingInvitationsPage = lazy(
  () => import("./employees/PendingInvitationsPage"),
);
const EmployeeOnboardingPage = lazy(
  () => import("./employees/EmployeeOnboardingPage"),
);
const OwnerOnboardingPage = lazy(() => import("./views/OwnerOnboardingPage"));
const SchedulePage = lazy(() => import("./views/SchedulePage"));
const ScheduleShiftDesignPage = lazy(
  () => import("./dev/ScheduleShiftDesignPage"),
);
const ScheduleShiftBadgeLabPage = lazy(
  () => import("./dev/ScheduleShiftBadgeLabPage"),
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
const NotificationSettingsPage = lazy(
  () => import("./settings/NotificationSettingsPage"),
);
const SchedulingSettingsPage = lazy(
  () => import("./settings/SchedulingSettingsPage"),
);
const ConflictHandlingSettingsPage = lazy(
  () => import("./settings/ConflictHandlingSettingsPage"),
);
const ShiftCatalogSettingsPage = lazy(
  () => import("./settings/ShiftCatalogSettingsPage"),
);
const ImportantDatesSettingsPage = lazy(
  () => import("./settings/ImportantDatesSettingsPage"),
);
const RolesSettingsPage = lazy(() => import("./settings/RolesSettingsPage"));

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
        <AuthProvider queryClient={appQueryClient}>
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
                    path="/dev/employee-onboarding"
                    element={<EmployeeOnboardingPreview />}
                  />
                  <Route
                    path="/dev/schedule-shift-badge-lab"
                    element={<Navigate to="/app/schedule-badge-lab" replace />}
                  />
                </>
              ) : null}
              {postMvpSurfaces ? (
                <Route path="/kiosk" element={<KioskPage />} />
              ) : null}
              <Route path="/accept-invite" element={<AcceptInvitationPage />} />
              <Route path="/invite/accept" element={<AcceptInvitationPage />} />
              <Route
                path="/invitations/pending"
                element={
                  <ProtectedRoute>
                    <PendingInvitationsPage />
                  </ProtectedRoute>
                }
              />
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
                path="/organization-switcher"
                element={
                  <ProtectedRoute>
                    <OrganizationSwitcherPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/no-organization"
                element={
                  <ProtectedRoute>
                    <NoOrganizationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organization-switcher/pending"
                element={
                  <ProtectedRoute>
                    <PendingOrganizationStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organization-switcher/pending/:workspaceId"
                element={
                  <ProtectedRoute>
                    <PendingOrganizationStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organization-switcher/suspended"
                element={
                  <ProtectedRoute>
                    <SuspendedOrganizationStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organization-switcher/suspended/:workspaceId"
                element={
                  <ProtectedRoute>
                    <SuspendedOrganizationStatusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/app/account/documents"
                element={
                  <ProtectedRoute>
                    <DocumentNotificationRedirect />
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
                <Route path="security" element={<SecurityPage />} />
                <Route path="inbox" element={<NotificationsPage />} />
                <Route path="preferences" element={<PreferencesPage />} />
                <Route
                  path="preferences/notifications"
                  element={<NotificationPreferencesPage />}
                />
                <Route path="workspaces" element={<WorkspacesPage />} />
                <Route path="documents" element={<AccountDocumentsPage />} />
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
                      anyOf={["schedule.templates.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <ScheduleTemplatesPage />
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
                          roles={["owner", "admin", "manager"]}
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
                          roles={["owner", "admin", "manager"]}
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
                          roles={["owner", "admin", "manager"]}
                        >
                          <ScheduleShiftBadgeLabPage />
                        </PermissionRoute>
                      }
                    />
                  </>
                ) : null}
                {postMvpSurfaces ? (
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
                ) : null}
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
                  element={<ScheduleRequestsPage />}
                />
                <Route
                  path="availability"
                  element={
                    <PermissionRoute
                      anyOf={["availability.read"]}
                      roles={["owner", "admin", "manager"]}
                    >
                      <AvailabilityPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="important-dates"
                  element={
                    <PermissionRoute anyOf={["important_dates.read"]}>
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
                <Route path="employees/documents" element={<PermissionRoute anyOf={["employee_documents.read"]}><EmployeeDocumentsPage /></PermissionRoute>} />
                <Route
                  path="employees/archive"
                  element={
                    <PermissionRoute anyOf={["employees.read"]}>
                      <EmployeesPage />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="employee-hub/*"
                  element={
                    <PermissionRoute
                      anyOf={["workspace.read"]}
                      roles={["employee"]}
                    >
                      <EmployeeHubPage />
                    </PermissionRoute>
                  }
                />
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
                <Route path="notifications" element={<NotificationsPage />} />
                <Route
                  path="account/security"
                  element={<Navigate to="/account/security" replace />}
                />
                <Route path="settings" element={<SettingsLayout />}>
                  <Route index element={<SettingsHomeRedirect />} />
                  <Route
                    path="general"
                    element={
                      <PermissionRoute anyOf={["settings.general.read"]}>
                        <GeneralSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="locations"
                    element={
                      <PermissionRoute anyOf={["settings.locations.read"]}>
                        <LocationsSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="jobs"
                    element={
                      <PermissionRoute anyOf={["settings.jobs.read"]}>
                        <JobsSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="notifications"
                    element={
                      <PermissionRoute
                        anyOf={[
                          "notifications.settings.read",
                          "notifications.settings.write",
                        ]}
                      >
                        <NotificationSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling"
                    element={
                      <PermissionRoute anyOf={["settings.schedule_rules.read"]}>
                        <SchedulingSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling/conflicts"
                    element={
                      <PermissionRoute
                        anyOf={["schedule.conflict_rules.manage"]}
                      >
                        <ConflictHandlingSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-types"
                    element={
                      <PermissionRoute anyOf={["settings.shift_catalog.read"]}>
                        <ShiftCatalogSettingsPage />
                      </PermissionRoute>
                    }
                  />
                  <Route
                    path="scheduling/shift-labels"
                    element={
                      <PermissionRoute anyOf={["settings.shift_catalog.read"]}>
                        <ShiftCatalogSettingsPage />
                      </PermissionRoute>
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
                      <PermissionRoute
                        anyOf={["documents.read", "employee_documents.read"]}
                      >
                        <DocumentsSettingsRoute />
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
                  {postMvpSurfaces ? (
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
                  ) : null}
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
