import { CalendarDays, Home, Repeat2, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useInView, useReducedMotion } from "./motion";

type Screen = {
  readonly key: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly view: ReactNode;
};

const SCREENS: readonly Screen[] = [
  {
    key: "home",
    label: "Home",
    icon: <Home size={16} aria-hidden />,
    title: "The next shift, first thing",
    body: "Where, when and which job, plus anything that needs a tap: an announcement to confirm, a request that got an answer.",
    view: <HomeView />,
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: <CalendarDays size={16} aria-hidden />,
    title: "The published week, always current",
    body: "Employees see their own week the moment it is published, across every location they work at.",
    view: <ScheduleView />,
  },
  {
    key: "requests",
    label: "Requests",
    icon: <Repeat2 size={16} aria-hidden />,
    title: "Swaps, cover and time off in three taps",
    body: "Newfork shows only the coworkers who can take the shift and tells the employee exactly where the request stands.",
    view: <RequestsView />,
  },
  {
    key: "availability",
    label: "Availability",
    icon: <Sun size={16} aria-hidden />,
    title: "Availability that managers actually see",
    body: "Set it once, update it when life changes. It shows up in the manager's grid while they build the schedule.",
    view: <AvailabilityView />,
  },
];

export function EmployeeShowcase() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const reduced = useReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });

  useEffect(() => {
    if (!inView || touched || reduced) return;
    const timer = window.setTimeout(
      () => setActive((value) => (value + 1) % SCREENS.length),
      3800,
    );
    return () => window.clearTimeout(timer);
  }, [active, inView, touched, reduced]);

  const screen = SCREENS[active] ?? SCREENS[0]!;

  return (
    <section
      className="lp-section lp-employee"
      id="employee-app"
      aria-labelledby="employee-title"
    >
      <div className="lp-container lp-employee-layout" ref={ref}>
        <div className="lp-employee-copy">
          <p className="lp-eyebrow">The employee app</p>
          <h2 id="employee-title">
            Your team's schedule lives in their pocket.
          </h2>
          <p className="lp-lede">
            Nothing to install. Employees open Newfork in their phone's browser,
            and everything about their shifts is a thumb away.
          </p>
          <div
            className="lp-tabs"
            role="tablist"
            aria-label="Employee app screens"
          >
            {SCREENS.map((item, index) => (
              <button
                aria-controls="employee-panel"
                aria-selected={index === active}
                className={index === active ? "is-active" : undefined}
                id={`employee-tab-${item.key}`}
                key={item.key}
                onClick={() => {
                  setTouched(true);
                  setActive(index);
                }}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = (index + step + SCREENS.length) % SCREENS.length;
                  setTouched(true);
                  setActive(next);
                  document
                    .getElementById(`employee-tab-${SCREENS[next]?.key}`)
                    ?.focus();
                }}
                tabIndex={index === active ? 0 : -1}
                role="tab"
                type="button"
              >
                {item.icon}
                {item.label}
                {index === active && !touched && !reduced && inView ? (
                  <i className="lp-tab-timer" key={active} />
                ) : null}
              </button>
            ))}
          </div>
          <div
            aria-labelledby={`employee-tab-${screen.key}`}
            className="lp-tab-panel"
            id="employee-panel"
            key={screen.key}
            role="tabpanel"
          >
            <h3>{screen.title}</h3>
            <p>{screen.body}</p>
          </div>
        </div>
        <div className="lp-employee-device" aria-hidden="true">
          <div className="lp-device-halo" />
          <div className="lp-device">
            <div className="lp-device-frame">
              <div className="lp-device-screen">
                <div className="lp-phone-status">
                  <span>9:41</span>
                  <span className="lp-phone-island" />
                  <span>●●●</span>
                </div>
                <div className="lp-device-views">
                  {SCREENS.map((item, index) => (
                    <div
                      className={`lp-device-view${index === active ? " is-active" : ""}${index < active ? " is-before" : ""}`}
                      key={item.key}
                    >
                      {item.view}
                    </div>
                  ))}
                </div>
                <div className="lp-device-nav">
                  {SCREENS.map((item, index) => (
                    <span
                      className={index === active ? "is-active" : undefined}
                      key={item.key}
                    >
                      {item.icon}
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomeView() {
  return (
    <div className="lp-ev">
      <small className="lp-ev-eyebrow">Tuesday, Oct 13</small>
      <strong className="lp-ev-title">Good afternoon, Priya</strong>
      <div className="lp-ev-card lp-ev-card-hero">
        <small>Next shift · in 3 hours</small>
        <b>4:00 – 10:00 PM</b>
        <span>Server · Mission St.</span>
      </div>
      <div className="lp-ev-card lp-ev-card-ack">
        <small>Announcement</small>
        <b>New brunch menu starts Sunday</b>
        <span className="lp-ev-btn">Acknowledge</span>
      </div>
      <div className="lp-ev-card">
        <small>Request update</small>
        <b>Time off Oct 24 – 26 approved</b>
      </div>
    </div>
  );
}

function ScheduleView() {
  const days = [
    { day: "Mon 12", shift: "11a – 4p", place: "Mission St." },
    { day: "Tue 13", shift: "4p – 10p", place: "Mission St." },
    { day: "Wed 14", shift: null, place: "" },
    { day: "Thu 15", shift: "5p – 11p", place: "Valencia" },
    { day: "Fri 16", shift: null, place: "" },
    { day: "Sat 17", shift: "10a – 4p", place: "Mission St." },
  ];
  return (
    <div className="lp-ev">
      <small className="lp-ev-eyebrow">Week of Oct 12</small>
      <strong className="lp-ev-title">22 hours this week</strong>
      <ul className="lp-ev-week">
        {days.map((entry) => (
          <li className={entry.shift ? undefined : "is-off"} key={entry.day}>
            <span>{entry.day}</span>
            {entry.shift ? (
              <>
                <b>{entry.shift}</b>
                <small>{entry.place}</small>
              </>
            ) : (
              <small>Off</small>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RequestsView() {
  return (
    <div className="lp-ev">
      <small className="lp-ev-eyebrow">Sun 18 · 10a – 4p</small>
      <strong className="lp-ev-title">Who can cover?</strong>
      <ul className="lp-ev-people">
        <li className="is-picked">
          <i>SL</i>
          <span>
            <b>Sam Lee</b>
            <small>Server · available</small>
          </span>
        </li>
        <li>
          <i>JB</i>
          <span>
            <b>Jordan Bell</b>
            <small>Server · available</small>
          </span>
        </li>
        <li>
          <i>TK</i>
          <span>
            <b>Tess Kim</b>
            <small>Server · available</small>
          </span>
        </li>
      </ul>
      <span className="lp-ev-btn lp-ev-btn-block">Ask Sam to cover</span>
      <small className="lp-ev-foot">
        Only coworkers who can take this shift are shown.
      </small>
    </div>
  );
}

function AvailabilityView() {
  const days = ["M", "T", "W", "T", "F", "S", "S"];
  const slots = [
    [1, 1, 1, 0, 1, 1, 1],
    [1, 1, 0, 0, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
  ];
  return (
    <div className="lp-ev">
      <small className="lp-ev-eyebrow">Weekly availability</small>
      <strong className="lp-ev-title">When can you work?</strong>
      <div className="lp-ev-avail">
        <span />
        {days.map((day, index) => (
          <b key={index}>{day}</b>
        ))}
        {["AM", "PM", "Late"].map((part, row) => (
          <AvailabilityRow key={part} label={part} slots={slots[row] ?? []} />
        ))}
      </div>
      <span className="lp-ev-btn lp-ev-btn-block">Save availability</span>
    </div>
  );
}

function AvailabilityRow({
  label,
  slots,
}: {
  readonly label: string;
  readonly slots: readonly number[];
}) {
  return (
    <>
      <small>{label}</small>
      {slots.map((on, index) => (
        <i
          className={on ? "is-on" : undefined}
          key={index}
          style={{ animationDelay: `${index * 50}ms` }}
        />
      ))}
    </>
  );
}
