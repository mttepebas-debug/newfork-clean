import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  CheckCircle2,
  Pause,
  Play,
  Send,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { heroDays, heroPeople, heroScenes, heroShifts, type HeroShift } from "./landing-content";
import { usePrefersReducedMotion } from "./useLandingMotion";

const sceneMs = 3600;
type SceneKey = (typeof heroScenes)[number]["key"];

// Where a shift sits in a scene: the conflict fix moves Diego's Friday to
// Priya, and the swap hands Ava's Saturday to Marcus.
function rowFor(shift: HeroShift, scene: SceneKey): number {
  if (shift.id === "d2" && (scene === "publish" || scene === "swap")) return 2;
  if (shift.id === "a4" && scene === "swap") return 1;
  return shift.row;
}

export function HeroStage() {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const running = !paused && !reducedMotion;
  const scene = heroScenes[reducedMotion && !paused ? 2 : index]!;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(
      () => setIndex((value) => (value + 1) % heroScenes.length),
      sceneMs,
    );
    return () => window.clearTimeout(timer);
  }, [index, running]);

  const tilt = (event: PointerEvent<HTMLDivElement>) => {
    if (reducedMotion || !stageRef.current) return;
    const box = stageRef.current.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    stageRef.current.style.setProperty("--lp-tilt-x", `${(-y * 6).toFixed(2)}deg`);
    stageRef.current.style.setProperty("--lp-tilt-y", `${(x * 8).toFixed(2)}deg`);
  };
  const untilt = () => {
    stageRef.current?.style.setProperty("--lp-tilt-x", "0deg");
    stageRef.current?.style.setProperty("--lp-tilt-y", "0deg");
  };

  const published = scene.key === "publish" || scene.key === "swap";
  const activeIndex = heroScenes.findIndex((item) => item.key === scene.key);

  return (
    <div className="lp-hero-visual">
      <p className="lp-sr-only">
        Animated preview: a manager builds a restaurant schedule, fixes a
        conflict, publishes it to the crew's phones and approves a shift swap.
      </p>
      <div
        ref={stageRef}
        className="lp-stage"
        data-scene={scene.key}
        data-running={running ? "true" : "false"}
        onPointerMove={tilt}
        onPointerLeave={untilt}
        aria-hidden
      >
        <div className="lp-stage-orbit lp-stage-orbit-a" />
        <div className="lp-stage-orbit lp-stage-orbit-b" />

        <div className="lp-cockpit">
          <div className="lp-cockpit-chrome">
            <span />
            <span />
            <span />
            <div className="lp-cockpit-url">app.newfork.com/schedule</div>
          </div>
          <div className="lp-cockpit-bar">
            <div className="lp-cockpit-title">
              <strong>Week of Oct 12</strong>
              <span className="lp-pill">Downtown</span>
            </div>
            <span className={`lp-status ${published ? "is-live" : ""}`}>
              {published ? "Published" : "Draft"}
            </span>
            <span className={`lp-publish ${scene.key === "publish" ? "is-pressed" : ""}`}>
              <Send size={12} />
              Publish
            </span>
          </div>
          <div className="lp-grid">
            <div className="lp-grid-head">
              <span />
              {heroDays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="lp-grid-body">
              {heroPeople.map((person, row) => (
                <div className="lp-grid-row" key={person.name} style={{ "--row": row } as CSSProperties}>
                  <div className="lp-grid-person">
                    <span className="lp-avatar">{person.name[0]}</span>
                    <span>
                      <strong>{person.name}</strong>
                      <small>{person.job}</small>
                    </span>
                  </div>
                </div>
              ))}
              {heroShifts.map((shift, order) => {
                const conflict = shift.id === "d2" && scene.key === "check";
                const swapped = shift.id === "a4" && scene.key === "swap";
                return (
                  <span
                    key={shift.id}
                    className={[
                      "lp-shift",
                      `tone-${shift.tone}`,
                      published ? "is-live" : "",
                      conflict ? "is-conflict" : "",
                      swapped ? "is-swapped" : "",
                    ].join(" ")}
                    style={
                      {
                        "--row": rowFor(shift, scene.key),
                        "--day": shift.day,
                        "--i": order,
                      } as CSSProperties
                    }
                  >
                    {conflict ? <AlertTriangle size={10} /> : null}
                    {shift.time}
                  </span>
                );
              })}
              <div className="lp-callout lp-callout-conflict">
                <AlertTriangle size={14} />
                <div>
                  <strong>Diego is unavailable Fri evening</strong>
                  <span>Move to Priya S. · available</span>
                </div>
              </div>
              <div className="lp-callout lp-callout-swap">
                <ArrowLeftRight size={14} />
                <div>
                  <strong>Swap approved</strong>
                  <span>Sat 5–11 PM · Ava → Marcus</span>
                </div>
              </div>
            </div>
          </div>
          <div className="lp-toast">
            <CheckCircle2 size={15} />
            Week published · 14 shifts sent to 4 people
          </div>
        </div>

        <div className="lp-beam">
          {Array.from({ length: 6 }, (_, dot) => (
            <i key={dot} style={{ "--d": dot } as CSSProperties} />
          ))}
        </div>

        <div className="lp-phone">
          <div className="lp-phone-notch" />
          <div className="lp-phone-screen">
            <div className="lp-phone-top">
              <span>9:41</span>
              <span className="lp-phone-bars" />
            </div>
            <div className="lp-phone-banner">
              <Bell size={12} />
              <div>
                <strong>New schedule</strong>
                <span>Your week of Oct 12 is live</span>
              </div>
            </div>
            <p className="lp-phone-hello">Hi Ava</p>
            <div className="lp-phone-next">
              <small>Next shift</small>
              <strong>Mon · 11:00 AM – 5:00 PM</strong>
              <span>Server · Downtown</span>
            </div>
            <div className="lp-phone-list">
              {["Wed 11–5", "Fri 5–11", "Sat 5–11"].map((item) => (
                <span key={item} className={item.startsWith("Sat") ? "is-sat" : ""}>
                  {item}
                </span>
              ))}
            </div>
            <div className="lp-phone-empty">Schedule not published yet</div>
            <div className="lp-phone-request">
              <ArrowLeftRight size={12} />
              <div>
                <strong>Swap with Marcus</strong>
                <span className="lp-phone-request-state">
                  <i>Pending</i>
                  <b>Approved by manager</b>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="lp-float lp-float-conflicts">
          <span>Conflicts</span>
          <strong>
            <em className="lp-float-from">1</em>
            <em className="lp-float-to">0</em>
          </strong>
        </div>
        <div className="lp-float lp-float-coverage">
          <span>Coverage</span>
          <strong>100%</strong>
        </div>
      </div>

      <div className="lp-scenes">
        <button
          type="button"
          className="lp-scenes-toggle"
          onClick={() => setPaused((value) => !value)}
          aria-label={running ? "Pause animation" : "Play animation"}
          disabled={reducedMotion}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <ol>
          {heroScenes.map((item, position) => (
            <li key={item.key}>
              <button
                type="button"
                className={position === activeIndex ? "is-active" : ""}
                aria-current={position === activeIndex ? "step" : undefined}
                onClick={() => {
                  setIndex(position);
                  if (reducedMotion) setPaused(true);
                }}
              >
                <span className="lp-scenes-track">
                  <span
                    key={`${item.key}-${index}-${running}`}
                    className="lp-scenes-fill"
                    style={{ animationDuration: `${sceneMs}ms` }}
                  />
                </span>
                <span className="lp-scenes-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="lp-scenes-caption">{scene.caption}</p>
      </div>
    </div>
  );
}
