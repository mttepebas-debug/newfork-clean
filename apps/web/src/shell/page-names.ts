/**
 * The name a page goes by in the menu, for the no-access card's title
 * ("You don't have access to Schedule"). One list, so a guard that refuses an
 * address and a page the API refuses say the same thing (Mert 2026-10-14).
 */
const pageNames: readonly (readonly [RegExp, string])[] = [
  [/^\/app\/workspace\/?$/, "Home"],
  [/^\/app\/schedule\/requests\/?$/, "Requests"],
  [/^\/app\/schedule\/lineup\/?$/, "Lineup"],
  [/^\/app\/schedule(\/(export|templates))?\/?$/, "Schedule"],
  [/^\/app\/availability\/?$/, "Availability"],
  [/^\/app\/employees\/documents\/?$/, "Documents"],
  [/^\/app\/employees(\/archive)?\/?$/, "Employees"],
  [/^\/app\/employee-hub\/schedule\/?$/, "Schedule"],
  [/^\/app\/employee-hub\/schedule\/lineup\/?$/, "Lineup"],
  [/^\/app\/employee-hub\/shift-hub(\/.*)?$/, "Shift Hub"],
  [/^\/app\/employee-hub\/my-availability\/?$/, "My Availability"],
  [/^\/app\/employee-hub\/documents\/?$/, "Documents"],
  [/^\/app\/my-documents\/?$/, "My documents"],
  [/^\/app\/employee-hub(\/.*)?$/, "Employee Hub"],
  [/^\/app\/(announcements\/)?important-dates(\/.*)?$/, "Important Dates"],
  [/^\/app\/announcements(\/.*)?$/, "Announcements"],
  [/^\/app\/notifications\/?$/, "Notifications"],
  [/^\/app\/settings\/general\/?$/, "General"],
  [/^\/app\/settings\/locations\/?$/, "Locations"],
  [/^\/app\/settings\/jobs\/?$/, "Jobs"],
  [/^\/app\/settings\/notifications\/?$/, "Notifications"],
  [/^\/app\/settings\/scheduling\/conflicts\/?$/, "Conflict handling"],
  [/^\/app\/settings\/scheduling\/shift-types\/?$/, "Shift types"],
  [/^\/app\/settings\/scheduling\/shift-labels\/?$/, "Shift labels"],
  [/^\/app\/settings\/scheduling\/?$/, "Schedule rules"],
  [/^\/app\/settings\/roles(\/.*)?$/, "Roles & permissions"],
  [/^\/app\/settings\/documents\/?$/, "Documents"],
  [/^\/app\/settings\/acknowledgements\/?$/, "Acknowledgements"],
  [/^\/account\/preferences\/notifications\/?$/, "Notifications"],
];

/** "Schedule" for /app/schedule; "this page" for an address not in the list. */
export function pageName(pathname: string): string {
  return pageNames.find(([pattern]) => pattern.test(pathname))?.[1] ?? "this page";
}
