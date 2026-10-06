import { Check, Pause, Play } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useInView, useReducedMotion, useSceneLoop } from "./motion";

/**
 * The hero's motion piece: one week in the life of a schedule, told without
 * words. A manager builds the week in the cockpit, overrides one availability
 * warning, publishes; Diego's phone lights up, he asks to swap his Friday with
 * Maya's Saturday, the manager approves and the two shifts trade places.
 *
 * Geometry is in cqw (percent of the cockpit's width), so the whole window
 * scales like an image from a phone to a wide monitor.
 */

const SCENE_MS = [2600, 1900, 1300, 1900, 1900, 2100, 1700, 3000] as const;
const FINAL_SCENE = SCENE_MS.length - 1;

const RAIL = 6;
const PAD = 1.2;
const NAME = 16.5;
const DAY = (100 - RAIL - PAD * 2 - NAME) / 7;
const TOP = 10.5;
const HEAD = 4.2;
const ROW = 5.5;

const DAYS = [
  "Mon 12",
  "Tue 13",
  "Wed 14",
  "Thu 15",
  "Fri 16",
  "Sat 17",
  "Sun 18",
];

type Person = {
  readonly name: string;
  readonly job: string;
  readonly tone: Tone;
};
type Tone = "cook" | "server" | "host" | "dish";

const PEOPLE: readonly Person[] = [
  { name: "Maya Ortiz", job: "Line cook", tone: "cook" },
  { name: "Diego Ramos", job: "Line cook", tone: "cook" },
  { name: "Sam Lee", job: "Server", tone: "server" },
  { name: "Priya Shah", job: "Server", tone: "server" },
  { name: "Jordan Bell", job: "Host", tone: "host" },
  { name: "Ana Cruz", job: "Dish", tone: "dish" },
];

type Shift = {
  readonly id: string;
  readonly row: number;
  readonly day: number;
  readonly time: string;
};

const SHIFTS: readonly Shift[] = [
  { id: "m0", row: 0, day: 0, time: "7a–3p" },
  { id: "m3", row: 0, day: 3, time: "7a–3p" },
  { id: "msat", row: 0, day: 5, time: "4p–11p" },
  { id: "d0", row: 1, day: 0, time: "3p–11p" },
  { id: "d2", row: 1, day: 2, time: "3p–11p" },
  { id: "dfri", row: 1, day: 4, time: "4p–11p" },
  { id: "s1", row: 2, day: 1, time: "11a–5p" },
  { id: "s4", row: 2, day: 4, time: "5p–11p" },
  { id: "s5", row: 2, day: 5, time: "5p–11p" },
  { id: "p0", row: 3, day: 0, time: "11a–4p" },
  { id: "p2", row: 3, day: 2, time: "4p–10p" },
  { id: "p6", row: 3, day: 6, time: "10a–4p" },
  { id: "j3", row: 4, day: 3, time: "5p–10p" },
  { id: "j4", row: 4, day: 4, time: "5p–11p" },
  { id: "j5", row: 4, day: 5, time: "5p–11p" },
  { id: "a1", row: 5, day: 1, time: "4p–12a" },
  { id: "a4", row: 5, day: 4, time: "4p–12a" },
  { id: "a6", row: 5, day: 6, time: "3p–11p" },
];

const NEW_SHIFT = { row: 0, day: 1, time: "7a–3p" } as const;

function cellX(day: number): number {
  return RAIL + PAD + NAME + day * DAY;
}
function cellY(row: number): number {
  return TOP + HEAD + row * ROW;
}
function cellCenter(day: number, row: number): readonly [number, number] {
  return [cellX(day) + DAY / 2, cellY(row) + ROW / 2];
}

const WARNING_X = cellX(NEW_SHIFT.day) - 1;
const WARNING_Y = cellY(NEW_SHIFT.row) + ROW * 1.02;
const PUBLISH_AT = [92.6, 7.3] as const;
const KEEP_AT = [WARNING_X + 18.4, WARNING_Y + 3.1] as const;
const APPROVE_AT = [92.2, 45.2] as const;
const PARK_AT = [70, 44] as const;

const CURSOR_PATH: readonly (readonly [number, number])[] = [
  PARK_AT,
  cellCenter(NEW_SHIFT.day, NEW_SHIFT.row),
  KEEP_AT,
  PUBLISH_AT,
  [78, 30],
  [78, 30],
  APPROVE_AT,
  APPROVE_AT,
];

function at(x: number, y: number): CSSProperties {
  return { left: `${x}cqw`, top: `${y}cqw` };
}

export function HeroStage() {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [ref, inView] = useInView<HTMLDivElement>({
    threshold: 0.05,
    rootMargin: "0px",
  });
  const running = inView && !paused && !reduced;
  const scene = useSceneLoop(SCENE_MS, running, FINAL_SCENE);
  // The loop restarts by remounting, so every entrance plays again.
  const [cycle, setCycle] = useState(0);
  const [lastScene, setLastScene] = useState(scene);
  if (scene !== lastScene) {
    setLastScene(scene);
    if (scene === 0 && lastScene === FINAL_SCENE)
      setCycle((value) => value + 1);
  }

  const placed = scene >= 1;
  const overridden = scene >= 2;
  const published = scene >= 3;
  const notified = scene === 4 || scene === 5;
  const swapAsked = scene >= 5;
  const reviewing = scene === 6;
  const approved = scene >= 7;
  const [cursorX, cursorY] = CURSOR_PATH[scene] ?? PARK_AT;

  return (
    <div
      className={`lp-stage${reduced ? " is-static" : ""}`}
      data-scene={scene}
      ref={ref}
    >
      <p className="lp-visually-hidden">
        Animation: a manager builds a week of shifts in the Newfork schedule,
        overrides an availability warning and publishes. An employee gets the
        schedule on his phone, asks to swap a shift, and the manager approves
        it; the two shifts trade places.
      </p>
      <div className="lp-stage-scene" aria-hidden="true" key={cycle}>
        <div
          className="lp-cockpit"
          style={{
            ["--day" as string]: `${DAY}cqw`,
            ["--days-left" as string]: `${PAD + NAME}cqw`,
          }}
        >
          <div className="lp-cockpit-bar">
            <span className="lp-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-cockpit-url">app.newfork · Schedule</span>
          </div>
          <div className="lp-cockpit-rail">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <i
                key={index}
                className={index === 1 ? "is-active" : undefined}
              />
            ))}
          </div>
          <div className="lp-cockpit-toolbar">
            <strong>Oct 12 – 18</strong>
            <span className="lp-chip lp-chip-location">
              <i /> Mission St.
            </span>
            <span className={`lp-chip lp-status${published ? " is-live" : ""}`}>
              {published ? "Published" : "Draft"}
            </span>
            <span className={`lp-publish${published ? " is-done" : ""}`}>
              {published ? (
                <>
                  <Check size={10} strokeWidth={3} /> Published
                </>
              ) : (
                "Publish"
              )}
            </span>
          </div>

          <div className="lp-grid-head" style={{ top: `${TOP}cqw` }}>
            {DAYS.map((day, index) => (
              <span
                key={day}
                style={{ left: `${cellX(index)}cqw`, width: `${DAY}cqw` }}
              >
                {day}
              </span>
            ))}
          </div>
          {PEOPLE.map((person, row) => (
            <div
              className="lp-grid-row"
              key={person.name}
              style={{
                top: `${cellY(row)}cqw`,
                height: `${ROW}cqw`,
                animationDelay: `${row * 70}ms`,
              }}
            >
              <span className="lp-avatar" data-tone={person.tone}>
                {person.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <span className="lp-person">
                <b>{person.name}</b>
                <small>{person.job}</small>
              </span>
            </div>
          ))}
          {published ? <span className="lp-sweep" /> : null}

          {SHIFTS.map((shift, index) => {
            const row =
              approved && shift.id === "dfri"
                ? 0
                : approved && shift.id === "msat"
                  ? 1
                  : shift.row;
            const tone = PEOPLE[shift.row]?.tone ?? "cook";
            const swapping =
              swapAsked && (shift.id === "dfri" || shift.id === "msat");
            return (
              <span
                className={`lp-shift${swapping && !approved ? " is-pending" : ""}${approved && swapping ? " is-swapped" : ""}`}
                data-tone={tone}
                key={shift.id}
                style={{
                  ...at(cellX(shift.day) + 0.35, cellY(row) + 0.55),
                  width: `${DAY - 0.7}cqw`,
                  height: `${ROW - 1.1}cqw`,
                  animationDelay: `${260 + index * 85}ms`,
                }}
              >
                {shift.time}
              </span>
            );
          })}

          {placed ? (
            <span
              className={`lp-shift lp-shift-new${overridden ? " is-overridden" : ""}`}
              data-tone="cook"
              style={{
                ...at(cellX(NEW_SHIFT.day) + 0.35, cellY(NEW_SHIFT.row) + 0.55),
                width: `${DAY - 0.7}cqw`,
                height: `${ROW - 1.1}cqw`,
              }}
            >
              {NEW_SHIFT.time}
            </span>
          ) : null}

          {placed && !published ? (
            <span
              className={`lp-warning${overridden ? " is-resolved" : ""}`}
              style={at(WARNING_X, WARNING_Y)}
            >
              <b>{overridden ? "Kept" : "Maya prefers Tue off"}</b>
              <small>
                {overridden
                  ? "Availability warning noted"
                  : "Availability · warning"}
              </small>
              {overridden ? null : (
                <span className="lp-warning-keep">Keep</span>
              )}
            </span>
          ) : null}

          <div className="lp-cockpit-foot">
            <span>
              <b>{placed ? 19 : 18}</b> shifts
            </span>
            <span>
              <b>{placed ? 118 : 110}</b> hours
            </span>
            <span>
              <b>0</b> conflicts
            </span>
            <span>
              <b>6</b> people
            </span>
          </div>

          {reviewing || approved ? (
            <div className={`lp-request${approved ? " is-approved" : ""}`}>
              <span className="lp-request-kind">Swap request</span>
              <b>Diego ⇄ Maya</b>
              <small>Fri 4p–11p for Sat 4p–11p · eligible</small>
              <span className="lp-request-actions">
                <span className="lp-btn-ghost">Decline</span>
                <span className="lp-btn-approve">
                  {approved ? (
                    <>
                      <Check size={9} strokeWidth={3} /> Approved
                    </>
                  ) : (
                    "Approve"
                  )}
                </span>
              </span>
            </div>
          ) : null}

          {reduced ? null : (
            <span className="lp-cursor" style={at(cursorX, cursorY)}>
              <svg viewBox="0 0 24 24" width="100%" height="100%">
                <path
                  d="M4 2.5 19.5 13l-6.6 1.2 3.8 7.3-2.7 1.4-3.8-7.4L5.3 20z"
                  fill="currentColor"
                  stroke="#fff"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
              {scene === 1 || scene === 2 || scene === 3 || scene === 7 ? (
                <i className="lp-click" key={scene} />
              ) : null}
            </span>
          )}
        </div>

        <div className="lp-phone">
          <div className="lp-phone-frame">
            <div className="lp-phone-screen">
              <div className="lp-phone-status">
                <span>9:41</span>
                <span className="lp-phone-island" />
                <span>●●●</span>
              </div>
              <div className={`lp-phone-push${notified ? " is-in" : ""}`}>
                <span className="lp-phone-push-icon">N</span>
                <span>
                  <b>Schedule published</b>
                  <small>Your week of Oct 12 is live.</small>
                </span>
              </div>
              <div className="lp-phone-body">
                <small className="lp-phone-eyebrow">
                  Mission St. · Line cook
                </small>
                <strong className="lp-phone-hello">Hi Diego</strong>
                <div
                  className={`lp-phone-next${approved ? " is-updated" : ""}`}
                >
                  <small>Next shift</small>
                  <b>
                    {approved
                      ? "Sat 17 · 4:00–11:00 PM"
                      : "Fri 16 · 4:00–11:00 PM"}
                  </b>
                  <span
                    className={`lp-phone-state${swapAsked ? " is-shown" : ""}${approved ? " is-approved" : ""}`}
                  >
                    {approved ? "Swap approved" : "Swap pending · manager"}
                  </span>
                </div>
                <ul className="lp-phone-week">
                  <li>
                    <span>Mon</span>
                    <b>3p–11p</b>
                  </li>
                  <li>
                    <span>Wed</span>
                    <b>3p–11p</b>
                  </li>
                  <li
                    className={swapAsked && !approved ? "is-active" : undefined}
                  >
                    <span>{approved ? "Sat" : "Fri"}</span>
                    <b>4p–11p</b>
                  </li>
                </ul>
                <span
                  className={`lp-phone-cta${scene === 5 ? " is-pressed" : ""}`}
                >
                  {swapAsked ? "Request sent" : "Request a swap"}
                </span>
              </div>
              <div className="lp-phone-nav">
                <i className="is-active" />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        </div>

        {scene === 5 ? (
          <span className="lp-flyer">
            <b>Swap</b> Fri ⇄ Sat
          </span>
        ) : null}

        <span className="lp-float lp-float-a">
          <i data-tone="warn" /> Conflicts caught while you build
        </span>
        <span className="lp-float lp-float-b">
          <i data-tone="ok" /> Live on every phone
        </span>
        <span className="lp-float lp-float-c">
          <i data-tone="note" /> Routed to the right manager
        </span>
      </div>

      {reduced ? null : (
        <button
          className="lp-stage-toggle"
          type="button"
          onClick={() => setPaused((value) => !value)}
          aria-pressed={paused}
        >
          {paused ? (
            <Play size={14} aria-hidden />
          ) : (
            <Pause size={14} aria-hidden />
          )}
          {paused ? "Play animation" : "Pause animation"}
        </button>
      )}
    </div>
  );
}
