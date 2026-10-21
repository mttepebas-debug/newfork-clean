// Schedule from scratch: three directions on one behaviour engine.
// DEV-only route /proto/schedule (App.tsx). Reads the real week, writes nothing.
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import { ScheduleProvider } from "./engine/useSchedule";
import { PassSchedule } from "./directions/pass/PassSchedule";
import { TimelineSchedule } from "./directions/timeline/TimelineSchedule";
import { TicketSchedule } from "./directions/ticket/TicketSchedule";
import "./shared/dock.css";

const FONTS =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Archivo:wght@400;500;600;700;800&family=Archivo+Narrow:wght@500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400;1,6..72,500&family=IBM+Plex+Mono:wght@400;500&display=swap";

const DIRECTIONS = [
  { id: "a", name: "Pass", note: "Modern tool" },
  { id: "b", name: "Timeline", note: "Information design" },
  { id: "c", name: "Ticket", note: "Editorial" },
] as const;

export default function ProtoSchedulePage() {
  const [params, setParams] = useSearchParams();
  const direction = params.get("d") === "b" ? "b" : params.get("d") === "c" ? "c" : "a";

  useEffect(() => {
    if (document.getElementById("proto-schedule-fonts")) return;
    const link = document.createElement("link");
    link.id = "proto-schedule-fonts";
    link.rel = "stylesheet";
    link.href = FONTS;
    document.head.append(link);
  }, []);

  const choose = (id: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("d", id);
        return next;
      },
      { replace: true },
    );

  return (
    <ScheduleProvider>
      {(s) => {
        // Exposed for the prototype's own checks (artifacts/schedule-from-scratch/verify.mjs).
        (window as unknown as { __protoSchedule?: unknown }).__protoSchedule = s;
        return (
        <>
          {direction === "a" ? <PassSchedule s={s} /> : direction === "b" ? <TimelineSchedule s={s} /> : <TicketSchedule s={s} />}
          {/* The prototype's own switch, not part of any design. */}
          <nav className="proto-dock" data-proto-layer aria-label="Design direction">
            {DIRECTIONS.map((d) => (
              <button key={d.id} type="button" aria-pressed={direction === d.id} onClick={() => choose(d.id)}>
                <b>{d.id.toUpperCase()}</b> {d.name}
                <small>{d.note}</small>
              </button>
            ))}
          </nav>
        </>
        );
      }}
    </ScheduleProvider>
  );
}
