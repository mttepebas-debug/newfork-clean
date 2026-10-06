// FAQ content. Every answer describes what the product does today; the
// evidence for each claim is listed in docs/PRODUCT-TRUTH.md. Answers are
// plain text: they are rendered on the page and reused verbatim in the
// FAQPage schema.

export type FaqItem = {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
};

export type FaqCategory = {
  readonly id: string;
  readonly title: string;
  readonly items: readonly FaqItem[];
};

export const FAQ: readonly FaqCategory[] = [
  {
    id: "product",
    title: "The product",
    items: [
      {
        id: "what-is-it",
        question: "What is Newfork?",
        answer:
          "Newfork is scheduling and team operations software for restaurants. Managers build and publish the weekly schedule, review time off and shift changes, onboard new hires and post announcements. Employees see their published shifts, ask for time off, swap or pick up shifts, set their availability and handle their paperwork from their phone.",
      },
      {
        id: "who-is-it-for",
        question: "Who is it for?",
        answer:
          "Restaurant groups with a few locations, a manager at each one and an owner who sees all of them. It works the same way for a single restaurant.",
      },
      {
        id: "devices",
        question: "Is there a mobile app?",
        answer:
          "Newfork runs in the browser; there is nothing to install. Employees use it on their phones. Managers build the schedule on a computer (the Schedule screen is desktop-only on purpose), and can review requests, employees and announcements from a phone.",
      },
      {
        id: "not-included",
        question: "Does it do time clocks, payroll or labor costs?",
        answer:
          "No. Newfork covers scheduling and the work around it: requests, availability, onboarding, documents and announcements. It shows scheduled hours per person and per day, but it has no time clock, timesheets, payroll or wage figures.",
      },
      {
        id: "notifications",
        question: "How do people find out about changes?",
        answer:
          "Through the in-app Notifications inbox, unread badges and the employee Home screen. A published schedule, a request waiting for a decision, an approved swap and a new announcement each create a notification for the people involved. Email, text and push delivery for these updates are not available today.",
      },
    ],
  },
  {
    id: "scheduling",
    title: "Scheduling",
    items: [
      {
        id: "how-scheduling-works",
        question: "How does scheduling work?",
        answer:
          "You build the week in a draft: a grid with your people in rows and the days in columns, one block per location. Drafts are visible only to the people who schedule. When the week is ready, Publish walks you through three steps: choose the locations, review the pre-flight check, and choose who gets notified. Employees only ever see published shifts.",
      },
      {
        id: "multiple-locations",
        question: "Does it support multiple locations?",
        answer:
          "Yes. Each location has its own address and time zone. Owners and admins see every location; a manager sees and schedules the locations they are assigned to. The schedule shows each location side by side, or merged into one view, and you can publish location by location.",
      },
      {
        id: "multi-location-employees",
        question: "Can employees work at more than one location?",
        answer:
          "Yes. A person can be assigned to several locations and jobs, each with a primary. When you schedule them at one location, their shifts at the other locations appear as gray ghost shifts in your grid, and a shift that overlaps one of those is blocked, so nobody is double-booked across locations.",
      },
      {
        id: "conflicts",
        question: "Which conflicts does it catch?",
        answer:
          "Overlapping shifts, approved time off and a person who isn't assigned to the location or job are always blocked. Closed days, minimum travel and rest time between shifts, and missing or expired required documents follow your workspace's conflict rules: warn, require confirmation, or block. Availability is a preference, so it only ever warns.",
      },
      {
        id: "templates-export",
        question: "Can I reuse a week or print the schedule?",
        answer:
          "Yes. Save a draft as a template and apply it to another week, either on top of what is there or replacing it. Export the schedule as PDF, PNG or Excel, to download or print.",
      },
    ],
  },
  {
    id: "requests",
    title: "Time off, swaps and approvals",
    items: [
      {
        id: "time-off",
        question: "Can employees request time off?",
        answer:
          "Yes, from their phone: full days, specific hours, or different hours on different dates, up to 31 days, with an optional note. They can track the decision and withdraw a request that is still pending. Once approved, the time off shows on the schedule and that person can't be scheduled over it.",
      },
      {
        id: "time-off-approval",
        question: "Who approves time off?",
        answer:
          "Requests go one level up. A manager at each of the employee's locations approves, and a single denial closes the request. Admins and owners can decide on their own. A manager's request goes to an admin or the owner, and nobody decides their own request. A workspace setting sets how long before the time off starts a decision is due; undecided requests are declined.",
      },
      {
        id: "time-off-shifts",
        question: "What happens to shifts during approved time off?",
        answer:
          "Before approving, the manager sees which published shifts would be affected. On approval, those shifts become open shifts that eligible teammates can pick up.",
      },
      {
        id: "swaps",
        question: "How are shift swaps and cover handled?",
        answer:
          "In the Shift Hub an employee can swap a shift with a teammate, offer a shift to every eligible teammate, ask one teammate to cover, or ask to pick up an open shift. Only people who fit the location, job and schedule are listed. The teammate accepts, then a manager gives final approval; until then the shift stays with its current owner. A swap between two locations needs both managers.",
      },
      {
        id: "availability",
        question: "How does availability work?",
        answer:
          "Employees mark the days and times they can't work each week. Managers see it while scheduling. It is a preference, not a block: scheduling over it shows a warning, and an employee can knowingly accept a shift that conflicts with their own availability.",
      },
    ],
  },
  {
    id: "team",
    title: "Team, onboarding and documents",
    items: [
      {
        id: "onboarding",
        question: "How do new employees get started?",
        answer:
          "You add them with their legal name, locations, jobs and role, and send an email invitation. They create an account and go through onboarding: profile, required documents and policies, and availability if you ask for it. Then they send it for review and a manager opens their access.",
      },
      {
        id: "documents",
        question: "Can it track required documents like food handler cards?",
        answer:
          "Yes. Owners and admins define which documents each location, department or job needs, whether a manager reviews them, and whether expiry is tracked. Employees upload a photo or file from their phone; reviewers approve or reject with a reason. Employees are reminded before an approved document expires, and missing or expired required documents can count as scheduling conflicts.",
      },
      {
        id: "policies",
        question: "Can employees sign company policies?",
        answer:
          "Employees read the policy, tick the acknowledgement and type their full name. Newfork records who acknowledged which version and when, and the employee can download a copy.",
      },
      {
        id: "leaving",
        question: "What happens when an employee leaves?",
        answer:
          "An admin or the owner terminates the employee with an effective date and a reason. Their access is suspended, their published shifts from that time on become open shifts, and the record moves to Archived with its history. A manager can also remove someone from just one location; their shifts there become open.",
      },
      {
        id: "import",
        question: "Can I import my team from a spreadsheet?",
        answer:
          "Not today. You add people during workspace setup or from the Employees screen, one at a time.",
      },
    ],
  },
  {
    id: "security",
    title: "Security and data",
    items: [
      {
        id: "data-separation",
        question: "How is employee data kept separate between businesses?",
        answer:
          "Every workspace's data is isolated in the database itself: each read and write is checked against the person's workspace, role and locations before it happens. Employee documents are stored privately and opened only through short-lived download links.",
      },
      {
        id: "who-sees-what",
        question: "Who can see employee information?",
        answer:
          "It depends on the role. Owners and admins see every location. Managers see the people at the locations they manage. Employees see their own information and the published schedule of their locations. Owners and admins can create custom roles with read or edit access per area.",
      },
      {
        id: "sign-in",
        question: "How do people sign in?",
        answer:
          "With an email address and a password of at least eight characters. New accounts confirm their email, and passwords can be reset by email. Single sign-on and two-factor authentication are not available today.",
      },
    ],
  },
  {
    id: "business",
    title: "Pricing and getting started",
    items: [
      {
        id: "pricing",
        question: "How much does it cost?",
        answer:
          "Pricing has not been published yet. Contact us and we will walk you through the product and early access for your locations.",
      },
      {
        id: "setup",
        question: "How long does setup take?",
        answer:
          "Creating a workspace is a four-step wizard: name the workspace, add your locations, add your jobs, and optionally invite your team. You can start scheduling as soon as people are added.",
      },
      {
        id: "support",
        question: "How do I get help?",
        answer:
          "Use the Contact page. Inside the app, Settings → Support opens an email to the team and shows your workspace details to copy into it.",
      },
    ],
  },
];
