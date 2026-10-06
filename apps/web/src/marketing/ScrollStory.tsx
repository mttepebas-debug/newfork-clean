import { CalendarRange, CheckCheck, ShieldAlert, Repeat2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

type Step = {
  readonly key: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly points: readonly string[];
};

const STEPS: readonly Step[] = [
  {
    key: "build",
    icon: <CalendarRange size={18} aria-hidden />,
    title: "Build the week in minutes",
    body: "Start from a saved template or a blank grid. Every location, job and person is on one screen, and the draft stays private until you publish.",
    points: [
      "Templates for your usual weeks",
      "Open shifts for gaps you still need to fill",
      "Drafts save themselves as you work",
    ],
  },
  {
    key: "check",
    icon: <ShieldAlert size={18} aria-hidden />,
    title: "Catch problems before anyone sees them",
    body: "Newfork checks each shift as you place it. Availability shows a warning you can override, approved time off blocks the cell, and shifts someone works at another location appear as ghosts.",
    points: [
      "Availability warnings, never surprises",
      "Approved time off can't be double-booked",
      "Cross-location shifts visible in every grid",
    ],
  },
  {
    key: "publish",
    icon: <CheckCheck size={18} aria-hidden />,
    title: "Publish once. Everyone has it.",
    body: "Publish one location or all of them. The schedule lands on every employee's phone, and you can see exactly which weeks and locations are live.",
    points: [
      "Publish per location or all at once",
      "Employees see only what is published",
      "Export to PDF or Excel for the wall",
    ],
  },
  {
    key: "adjust",
    icon: <Repeat2 size={18} aria-hidden />,
    title: "Handle the changes without the group text",
    body: "Swaps, cover and time off arrive as requests. Newfork offers shifts only to people who can take them and routes each decision to the manager responsible.",
    points: [
      "Eligibility checked automatically",
      "One approval from the right manager",
      "Everyone involved is notified",
    ],
  },
];

export function ScrollStory() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (Number.isFinite(index)) setActive(index);
        }
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    for (const element of stepRefs.current)
      if (element) observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className="lp-section lp-story"
      id="how-it-works"
      aria-labelledby="story-title"
    >
      <div className="lp-container">
        <header className="lp-section-head">
          <p className="lp-eyebrow">How it works</p>
          <h2 id="story-title">
            From blank week to a running floor, in four moves.
          </h2>
        </header>
        <div className="lp-story-layout">
          <ol className="lp-story-steps">
            {STEPS.map((step, index) => (
              <li
                className={index === active ? "is-active" : undefined}
                data-index={index}
                key={step.key}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
              >
                <span className="lp-story-num">0{index + 1}</span>
                <h3>
                  <span className="lp-story-icon">{step.icon}</span>
                  {step.title}
                </h3>
                <p>{step.body}</p>
                <ul>
                  {step.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="lp-story-inline" aria-hidden="true">
                  <StoryVisual step={index} />
                </div>
              </li>
            ))}
          </ol>
          <div className="lp-story-sticky" aria-hidden="true">
            <div className="lp-story-frame">
              <div className="lp-story-progress">
                {STEPS.map((step, index) => (
                  <i
                    key={step.key}
                    className={index <= active ? "is-on" : undefined}
                  />
                ))}
              </div>
              {STEPS.map((step, index) => (
                <div
                  className={`lp-story-layer${index === active ? " is-active" : ""}`}
                  key={step.key}
                >
                  <StoryVisual step={index} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryVisual({ step }: { readonly step: number }) {
  if (step === 0) return <BuildVisual />;
  if (step === 1) return <CheckVisual />;
  if (step === 2) return <PublishVisual />;
  return <AdjustVisual />;
}

function BuildVisual() {
  const cells = [
    [1, 1, 0, 1, 1, 1, 0],
    [0, 1, 1, 1, 0, 1, 1],
    [1, 0, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 1],
  ];
  return (
    <div className="lp-sv lp-sv-build">
      <div className="lp-sv-templates">
        <span>Fall weekdays</span>
        <span className="is-picked">Fall standard week</span>
        <span>Holiday weekend</span>
      </div>
      <div className="lp-sv-grid">
        {cells.flatMap((row, r) =>
          row.map((on, d) => (
            <i
              className={on ? "is-on" : undefined}
              key={`${r}-${d}`}
              style={{ animationDelay: `${(r * 7 + d) * 28}ms` }}
            />
          )),
        )}
      </div>
      <span className="lp-sv-tag">Draft · saved 2s ago</span>
    </div>
  );
}

function CheckVisual() {
  return (
    <div className="lp-sv lp-sv-check">
      <div className="lp-sv-row">
        <b>Maya O.</b>
        <span className="lp-sv-cell" />
        <span className="lp-sv-cell lp-sv-warn">
          <em>7a–3p</em>
          <small>Prefers off</small>
        </span>
        <span className="lp-sv-cell" />
      </div>
      <div className="lp-sv-row">
        <b>Sam L.</b>
        <span className="lp-sv-cell lp-sv-off">TIME OFF</span>
        <span className="lp-sv-cell" />
        <span className="lp-sv-cell lp-sv-ok">
          <em>5p–11p</em>
        </span>
      </div>
      <div className="lp-sv-row">
        <b>Ana C.</b>
        <span className="lp-sv-cell lp-sv-ghost">
          <em>4p–12a</em>
          <small>Valencia</small>
        </span>
        <span className="lp-sv-cell lp-sv-ok">
          <em>4p–12a</em>
        </span>
        <span className="lp-sv-cell" />
      </div>
      <div className="lp-sv-legend">
        <span>
          <i data-tone="warn" /> Warning you can override
        </span>
        <span>
          <i data-tone="off" /> Blocked by time off
        </span>
        <span>
          <i data-tone="ghost" /> Shift at another location
        </span>
      </div>
    </div>
  );
}

function PublishVisual() {
  return (
    <div className="lp-sv lp-sv-publish">
      <div className="lp-sv-locations">
        <span className="is-live">
          <i /> Mission St. <b>Published</b>
        </span>
        <span className="is-live">
          <i /> Valencia <b>Published</b>
        </span>
        <span>
          <i /> Oakland <b>Draft</b>
        </span>
      </div>
      <div className="lp-sv-phones">
        {Array.from({ length: 12 }, (_, index) => (
          <span key={index} style={{ animationDelay: `${200 + index * 90}ms` }}>
            <i />
          </span>
        ))}
      </div>
      <span className="lp-sv-tag is-live">12 people notified</span>
    </div>
  );
}

function AdjustVisual() {
  const requests = [
    {
      kind: "Swap",
      who: "Diego ⇄ Maya",
      when: "Fri for Sat",
      state: "Approved",
    },
    {
      kind: "Cover",
      who: "Priya → Sam",
      when: "Sun 10a–4p",
      state: "Eligible: 3",
    },
    {
      kind: "Time off",
      who: "Jordan B.",
      when: "Oct 24 – 26",
      state: "Needs you",
    },
  ];
  return (
    <div className="lp-sv lp-sv-adjust">
      {requests.map((request, index) => (
        <div
          className="lp-sv-request"
          key={request.kind}
          style={{ animationDelay: `${index * 140}ms` }}
        >
          <span className="lp-sv-kind">{request.kind}</span>
          <b>{request.who}</b>
          <small>{request.when}</small>
          <span
            className={`lp-sv-state${index === 0 ? " is-done" : index === 2 ? " is-todo" : ""}`}
          >
            {request.state}
          </span>
        </div>
      ))}
    </div>
  );
}
