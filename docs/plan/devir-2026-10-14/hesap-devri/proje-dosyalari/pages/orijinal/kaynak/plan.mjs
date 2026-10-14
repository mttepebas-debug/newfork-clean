// Which screens each person walks through while recording.
const tab = (name) => async (page) => page.getByRole("tab", { name }).first().click({ timeout: 4000 });
const button = (name) => async (page) => page.getByRole("button", { name }).first().click({ timeout: 4000 });
const link = (name) => async (page) => page.getByRole("link", { name }).first().click({ timeout: 4000 });
const text = (value) => async (page) => page.getByText(value).first().click({ timeout: 4000 });
const escape = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  for (const name of [/^close$/i, /^cancel$/i, /^close /i]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.count() && await b.isVisible()) { await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
  }
};
const back = async (page) => page.goBack();

// First thing on the page that answers to this name: tab, button, link, then any text.
const any = (name) => async (page) => {
  for (const locator of [page.getByRole("tab", { name }), page.getByRole("button", { name }), page.getByRole("link", { name }), page.getByText(name)]) {
    const first = locator.first();
    if (await first.count() && await first.isVisible()) return first.click({ timeout: 4000 });
  }
  throw new Error(`nothing named ${name}`);
};
const title = (name) => async (page) => page.getByTitle(name).first().click({ timeout: 4000 });
const dbl = (value) => async (page) => page.getByText(value).first().dblclick({ timeout: 4000 });
const tabs = (...names) => names.map(any);
const each = (...names) => names.flatMap((name) => [any(name), escape]);

const ownerSteps = [
  { name: "workspace", route: "/app/workspace" },
  { name: "employees", route: "/app/employees", actions: [...tabs(/^invited/i, /^onboarding/i, /^needs attention/i, /^active/i, /^archived/i, /^all$/i)] },
  { name: "employees-row", route: "/app/employees", actions: [...each("Maria Lopez", "Jake Thompson", "Priya Patel", "Ethan Brooks", "Sophie Martin", "Daniel Kim", "Carlos Rivera", "Aisha Johnson", "Tom Becker", "Luis Hernandez", "Emma Wilson", "Noah Garcia", "Olivia Chen", "Marcus Reed", "Grace Murphy", "Sam Okafor", "Hannah Lee", "Ryan Walsh", "Laura Bennett", "Ben Carter", "Chloe Adams", "Mert Tepebas"), any(/^archived/i), ...each("Kevin Wright")] },
  { name: "employees-add", route: "/app/employees", actions: [any(/add employee/i)] },
  { name: "employees-phone", route: "/app/employees", width: 390 },
  { name: "employee-documents", route: "/app/employees/documents", actions: [...tabs(/^needs review/i, /^missing/i, /^expired/i, /^completed/i, /^all/i), ...each("Jake Thompson", "Emma Wilson", "Grace Murphy", "Noah Garcia", "Maria Lopez")] },
  { name: "employees-archive", route: "/app/employees/archive" },
  { name: "schedule", route: "/app/schedule", actions: [title(/next/i), title(/previous/i), dbl("Carlos Rivera"), escape] },
  { name: "schedule-export", route: "/app/schedule/export" },
  { name: "schedule-templates", route: "/app/schedule/templates" },
  { name: "requests", route: "/app/schedule/requests", actions: [any(/^shift changes/i), ...tabs("Finding cover", "Awaiting response", "History", "Ready for review"), any(/^time off/i), any(/^closed/i), any(/^needs review/i)] },
  { name: "requests-swap", route: "/app/schedule/requests", actions: [any(/^shift changes/i), ...each("Carlos Rivera", "Luis Hernandez", "Open shift pickup"), any("Finding cover"), ...each("Maria Lopez"), any("Awaiting response"), ...each("Aisha Johnson"), any(/^time off/i), ...each("Maria Lopez", "Noah Garcia", "Olivia Chen"), any(/^closed/i), ...each("Priya Patel", "Tom Becker")] },
  { name: "requests-phone", route: "/app/schedule/requests", width: 390 },
  { name: "availability", route: "/app/availability" },
  { name: "important-dates", route: "/app/important-dates", actions: [...each("Halloween", "Fall menu launch", "Private event: Hoffman rehearsal dinner", "Thanksgiving Day", "Christmas Day", "New Year's Eve time-off blackout"), any(/new date/i), escape, any(/^past/i), any(/^archived/i)] },
  { name: "announcements", route: "/app/announcements", actions: [...tabs(/^draft/i, /^scheduled/i, /^published/i, /^archived/i, /^all/i)] },
  { name: "announcements-open", route: "/app/announcements", actions: [...each("Updated uniform policy", "Patio heaters are in", "Holiday party RSVP", "New fall menu tasting", "Inventory night"), any(/^archived/i), ...each("Summer patio hours"), any(/new announcement/i)] },
  { name: "announcements-phone", route: "/app/announcements", width: 390 },
  { name: "notifications", route: "/app/notifications" },
  { name: "settings-general", route: "/app/settings/general" },
  { name: "settings-locations", route: "/app/settings/locations" },
  { name: "settings-jobs", route: "/app/settings/jobs" },
  { name: "settings-notifications", route: "/app/settings/notifications" },
  { name: "settings-scheduling", route: "/app/settings/scheduling" },
  { name: "settings-conflicts", route: "/app/settings/scheduling/conflicts" },
  { name: "settings-shift-types", route: "/app/settings/scheduling/shift-types" },
  { name: "settings-shift-labels", route: "/app/settings/scheduling/shift-labels" },
  { name: "settings-important-dates", route: "/app/settings/important-dates" },
  { name: "settings-closed-days", route: "/app/settings/important-dates/closed-days" },
  { name: "settings-roles", route: "/app/settings/roles" },
  { name: "settings-documents", route: "/app/settings/documents", actions: [...each("Food Handler Card", "Alcohol Server Permit", "Employee Handbook", "Allergen Awareness Training")] },
  { name: "settings-acknowledgements", route: "/app/settings/acknowledgements" },
  { name: "settings-support", route: "/app/settings/support" },
  { name: "account-profile", route: "/account/profile" },
  { name: "account-security", route: "/account/security" },
  { name: "account-preferences", route: "/account/preferences" },
  { name: "account-notifications", route: "/account/preferences/notifications" },
  { name: "account-workspaces", route: "/account/workspaces" },
  { name: "account-documents", route: "/account/documents" },
  { name: "account-inbox", route: "/account/inbox" },
  { name: "hub", route: "/workspaces" },
];

const managerSteps = [
  { name: "workspace", route: "/app/workspace" },
  { name: "employees", route: "/app/employees", actions: [...tabs(/^invited/i, /^onboarding/i, /^active/i, /^all$/i), ...each("Maria Lopez", "Jake Thompson", "Priya Patel", "Carlos Rivera")] },
  { name: "employees-phone", route: "/app/employees", width: 390 },
  { name: "employee-documents", route: "/app/employees/documents", actions: [...each("Jake Thompson", "Emma Wilson", "Maria Lopez")] },
  { name: "schedule", route: "/app/schedule", actions: [title(/next/i), title(/previous/i)] },
  { name: "requests", route: "/app/schedule/requests", actions: [any(/^shift changes/i), ...each("Carlos Rivera", "Luis Hernandez", "Open shift pickup"), any(/^time off/i), ...each("Maria Lopez", "Noah Garcia", "Olivia Chen")] },
  { name: "important-dates", route: "/app/important-dates", actions: [...each("Halloween", "Fall menu launch", "Private event: Hoffman rehearsal dinner", "Thanksgiving Day", "Christmas Day", "New Year's Eve time-off blackout"), any(/new date/i), escape] },
  { name: "announcements", route: "/app/announcements", actions: [...each("Updated uniform policy", "Patio heaters are in", "Holiday party RSVP", "New fall menu tasting", "Inventory night")] },
  { name: "announcements-phone", route: "/app/announcements", width: 390 },
  { name: "notifications", route: "/app/notifications" },
  { name: "settings-documents", route: "/app/settings/documents", actions: [...each("Food Handler Card", "Employee Handbook")] },
];

const employeeSteps = [
  { name: "hub", route: "/app/employee-hub" },
  { name: "hub-schedule", route: "/app/employee-hub/schedule" },
  { name: "hub-shift-hub", route: "/app/employee-hub/shift-hub" },
  { name: "hub-availability", route: "/app/employee-hub/my-availability" },
  { name: "hub-more", route: "/app/employee-hub/more" },
  { name: "hub-phone", route: "/app/employee-hub", width: 390 },
  { name: "hub-schedule-phone", route: "/app/employee-hub/schedule", width: 390 },
  { name: "hub-shift-hub-phone", route: "/app/employee-hub/shift-hub", width: 390 },
  { name: "hub-availability-phone", route: "/app/employee-hub/my-availability", width: 390 },
  { name: "announcements", route: "/app/announcements", actions: [...each("Updated uniform policy", "Patio heaters are in")] },
  { name: "announcements-phone", route: "/app/announcements", width: 390, actions: [...each("Updated uniform policy", "Patio heaters are in")] },
  { name: "notifications", route: "/app/notifications" },
  { name: "account-documents", route: "/account/documents" },
  { name: "account-profile", route: "/account/profile" },
];

export const personas = [
  { key: "owner", label: "Mert Tepebas · Owner", email: "mert.tepebas@harborvine.test", start: "/app/workspace", steps: ownerSteps },
  { key: "admin", label: "Laura Bennett · Admin", email: "laura.bennett@harborvine.test", start: "/app/workspace", steps: managerSteps },
  { key: "manager", label: "Hannah Lee · Manager, Downtown", email: "hannah.lee@harborvine.test", start: "/app/workspace", steps: managerSteps },
  { key: "employee", label: "Maria Lopez · Employee, Downtown", email: "maria.lopez@harborvine.test", start: "/app/employee-hub", steps: employeeSteps },
  { key: "onboarding", label: "Ben Carter · New employee (onboarding)", email: "ben.carter@harborvine.test", start: "/workspaces", steps: [
    { name: "hub", route: "/workspaces" },
    { name: "welcome", route: "/welcome" },
  ] },
  { key: "invited", label: "Chloe Adams · Invited, not joined yet", email: "chloe.adams@harborvine.test", start: "/workspaces", steps: [
    { name: "hub", route: "/workspaces" },
  ] },
  { key: "newowner", label: "Jordan Hayes · New owner, setup not finished", email: "jordan.hayes@harborvine.test", start: "/onboarding", steps: [
    { name: "hub", route: "/workspaces" },
    { name: "onboarding", route: "/onboarding" },
  ] },
  { key: "nobusiness", label: "Alex Morgan · Signed up, no workspace", email: "alex.morgan@harborvine.test", start: "/workspaces", steps: [
    { name: "hub", route: "/workspaces" },
    { name: "account", route: "/account/profile" },
  ] },
  { key: "signedout", label: "Signed out", start: "/sign-in", steps: [
    { name: "sign-in", route: "/sign-in" },
    { name: "forgot", route: "/forgot-password" },
  ] },
];
