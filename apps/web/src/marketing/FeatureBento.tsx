import {
  BellRing,
  Building2,
  CalendarX2,
  FileDown,
  FileSignature,
  KeyRound,
  LayoutTemplate,
  Megaphone,
  Workflow,
} from "lucide-react";
import type { ReactNode } from "react";
import { useInView } from "./motion";

type Feature = {
  readonly key: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly art: ReactNode;
  readonly size?: "wide" | "tall";
};

const FEATURES: readonly Feature[] = [
  {
    key: "locations",
    icon: <Building2 size={18} aria-hidden />,
    title: "Every location, one cockpit",
    body: "Owners see the whole business; each manager runs their own location. When someone works at two, their other shifts show up as ghosts so nobody is booked twice.",
    art: <LocationsArt />,
    size: "wide",
  },
  {
    key: "requests",
    icon: <Workflow size={18} aria-hidden />,
    title: "Approvals that find the right person",
    body: "Requests go to the managers of that location — never to a peer, never to yourself. Owners and admins can always step in.",
    art: <ChainArt />,
    size: "tall",
  },
  {
    key: "templates",
    icon: <LayoutTemplate size={18} aria-hidden />,
    title: "Templates for your usual weeks",
    body: "Save a good week once and start the next one from it.",
    art: <TemplatesArt />,
  },
  {
    key: "dates",
    icon: <CalendarX2 size={18} aria-hidden />,
    title: "Closed days and important dates",
    body: "Holidays, private events and closures sit right in the grid, with rules for what can be scheduled on them.",
    art: <CalendarArt />,
  },
  {
    key: "announcements",
    icon: <Megaphone size={18} aria-hidden />,
    title: "Announcements people confirm",
    body: "Post to a location or the whole team and see who has acknowledged it.",
    art: <AckArt />,
  },
  {
    key: "documents",
    icon: <FileSignature size={18} aria-hidden />,
    title: "Onboarding and documents",
    body: "Invite by email, collect the documents you need, and keep signed copies with each person.",
    art: <OnboardingArt />,
    size: "wide",
  },
  {
    key: "roles",
    icon: <KeyRound size={18} aria-hidden />,
    title: "Roles you control",
    body: "Owner, admin, manager and employee out of the box, plus custom roles with exactly the permissions you choose.",
    art: <RolesArt />,
  },
  {
    key: "export",
    icon: <FileDown size={18} aria-hidden />,
    title: "PDF and Excel export",
    body: "Print the week for the back-of-house wall or keep it with your records.",
    art: <ExportArt />,
  },
  {
    key: "notifications",
    icon: <BellRing size={18} aria-hidden />,
    title: "Notifications without the noise",
    body: "Updates go to the person deciding and the people affected. Nobody else.",
    art: <NotifyArt />,
  },
];

export function FeatureBento() {
  const [ref, inView] = useInView<HTMLDivElement>({ once: true, threshold: 0 });
  return (
    <section
      className="lp-section lp-cockpit-section"
      id="cockpit"
      aria-labelledby="cockpit-title"
    >
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">The manager cockpit</p>
          <h2 id="cockpit-title">
            Everything a manager touches in a week, in one place.
          </h2>
          <p className="lp-lede">
            Newfork is built for owners and managers at a computer: a full week,
            every person and every decision on one screen.
          </p>
        </header>
        <div className={`lp-bento${inView ? " is-in" : ""}`} ref={ref}>
          {FEATURES.map((feature, index) => (
            <article
              className={`lp-tile${feature.size ? ` lp-tile-${feature.size}` : ""}`}
              key={feature.key}
              style={{ transitionDelay: `${index * 60}ms` }}
            >
              <div className="lp-tile-art" aria-hidden="true">
                {feature.art}
              </div>
              <h3>
                <span className="lp-tile-icon">{feature.icon}</span>
                {feature.title}
              </h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function LocationsArt() {
  return (
    <div className="lp-art-locations">
      {["Mission St.", "Valencia"].map((location, column) => (
        <div className="lp-art-col" key={location}>
          <span className="lp-art-col-head">
            <i data-location={column} /> {location}
          </span>
          {[0, 1, 2].map((row) => {
            const ghost = column === 1 && row === 1;
            const mirrored = column === 0 && row === 1;
            return (
              <span
                className={`lp-art-shift${ghost ? " is-ghost" : ""}${mirrored ? " is-source" : ""}`}
                key={row}
              >
                {ghost
                  ? "Ana · at Mission"
                  : mirrored
                    ? "Ana · 4p–12a"
                    : row === 0
                      ? "Sam · 11a–5p"
                      : "Priya · 5p–11p"}
              </span>
            );
          })}
        </div>
      ))}
      <svg
        className="lp-art-link"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <path d="M30 20 C 50 0, 50 40, 70 20" />
      </svg>
    </div>
  );
}

function ChainArt() {
  const steps = ["Employee", "Location manager", "Approved"];
  return (
    <div className="lp-art-chain">
      {steps.map((step, index) => (
        <span
          className="lp-art-chain-node"
          key={step}
          style={{ animationDelay: `${index * 0.9}s` }}
        >
          <i />
          {step}
        </span>
      ))}
      <span className="lp-art-chain-line">
        <i />
      </span>
      <span className="lp-art-chain-blocked">Peer manager · can't approve</span>
    </div>
  );
}

function TemplatesArt() {
  return (
    <div className="lp-art-templates">
      {[0, 1, 2].map((index) => (
        <span key={index} style={{ ["--i" as string]: index }}>
          {Array.from({ length: 12 }, (_, cell) => (
            <i
              key={cell}
              className={(cell + index) % 3 === 0 ? undefined : "is-on"}
            />
          ))}
        </span>
      ))}
    </div>
  );
}

function CalendarArt() {
  return (
    <div className="lp-art-calendar">
      {Array.from({ length: 14 }, (_, index) => (
        <span
          className={
            index === 3 ? "is-closed" : index === 9 ? "is-event" : undefined
          }
          key={index}
        >
          {index + 20}
        </span>
      ))}
    </div>
  );
}

function AckArt() {
  return (
    <div className="lp-art-ack">
      <span className="lp-art-ack-post">New brunch menu starts Sunday</span>
      <div className="lp-art-ack-people">
        {["MO", "DR", "SL", "PS", "JB", "AC"].map((initials, index) => (
          <span
            key={initials}
            style={{ animationDelay: `${0.4 + index * 0.35}s` }}
          >
            {initials}
            <i />
          </span>
        ))}
      </div>
    </div>
  );
}

function OnboardingArt() {
  const items = [
    "Profile",
    "Availability",
    "Food handler card",
    "Handbook signed",
  ];
  return (
    <div className="lp-art-onboarding">
      <div className="lp-art-onboarding-bar">
        <i />
      </div>
      {items.map((item, index) => (
        <span key={item} style={{ animationDelay: `${0.3 + index * 0.45}s` }}>
          <i />
          {item}
        </span>
      ))}
    </div>
  );
}

function RolesArt() {
  return (
    <div className="lp-art-roles">
      {["Owner", "Admin", "Manager", "Employee"].map((role, index) => (
        <span key={role} style={{ ["--i" as string]: index }}>
          {role}
        </span>
      ))}
    </div>
  );
}

function ExportArt() {
  return (
    <div className="lp-art-export">
      <span className="lp-art-sheet" data-kind="pdf">
        PDF
      </span>
      <span className="lp-art-sheet" data-kind="xls">
        XLSX
      </span>
    </div>
  );
}

function NotifyArt() {
  return (
    <div className="lp-art-notify">
      <span className="is-on">Diego · swap approved</span>
      <span className="is-on">Maya · swap approved</span>
      <span className="is-off">Everyone else · nothing</span>
    </div>
  );
}
