import { Button, toast } from "@newfork/ui";
import {
  BriefcaseBusiness,
  Check,
  MapPin,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LinesOutline, ListOutline, LoadError, LoadingOutline, Skeleton } from "../shell/LoadState";
import { ConfirmDialog } from "../shell/ConfirmDialog";
import { PreBizFrame } from "../shell/prebiz/PreBiz";
import ScheduleShiftDesignPage from "./ScheduleShiftDesignPage";
import { toastCatalog, type ToastEntry } from "./feedback-catalog";
import "../employee-hub/employee-dashboard.css";
import "../employee-hub/shift-exchanges/shift-exchanges.css";
import "../settings/jobs-settings.css";
import "../account/account.css";
import "./feedback-gallery.css";

// DEV-only showcase of every toast, loading, error, empty and banner state as
// the app draws them today. The stage is an iframe of this same route with
// ?frame=1, so toasts land in a real viewport of the chosen width.

type StageMessage =
  | { readonly kind: "toast"; readonly id: string }
  | { readonly kind: "stack" }
  | { readonly kind: "dedupe" }
  | { readonly kind: "clear" }
  | { readonly kind: "dialog"; readonly destructive: boolean }
  | { readonly kind: "speed"; readonly rate: number };

const catalogById = new Map(toastCatalog.map((entry) => [entry.id, entry]));

function fire(entry: ToastEntry, dedupeKey?: string) {
  toast[entry.tone](entry.title, { description: entry.description, dedupeKey });
}

export default function FeedbackGalleryPage() {
  const frame = new URLSearchParams(window.location.search).has("frame");
  return frame ? <FeedbackStage /> : <FeedbackControls />;
}

/* ---------- Stage: the real Schedule preview that receives commands ---------- */

function FeedbackStage() {
  const [dialog, setDialog] = useState<null | { destructive: boolean }>(null);
  const rate = useRef(1);

  useEffect(() => {
    let raf = 0;
    // ponytail: rewrites playbackRate every frame so new toast transitions slow down too.
    const tick = () => {
      if (rate.current !== 1) {
        for (const animation of document.getAnimations()) {
          if (animation.playbackRate !== rate.current) animation.playbackRate = rate.current;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onMessage = (event: MessageEvent<StageMessage>) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (message.kind === "toast") {
        const entry = catalogById.get(message.id);
        if (entry) fire(entry);
      } else if (message.kind === "stack") {
        toastCatalog
          .filter((_, index) => index % 7 === 0)
          .slice(0, 5)
          .forEach((entry, index) => window.setTimeout(() => fire(entry), index * 350));
      } else if (message.kind === "dedupe") {
        const entry = catalogById.get("save-failed")!;
        [0, 400, 800].forEach((delay) =>
          window.setTimeout(() => fire(entry, "gallery-dedupe"), delay),
        );
      } else if (message.kind === "clear") {
        // The facade has no dismiss; closing through the real buttons is enough for a gallery.
        document.querySelectorAll<HTMLButtonElement>("[data-sonner-toast] [data-close-button]").forEach((button) => button.click());
      } else if (message.kind === "dialog") {
        setDialog({ destructive: message.destructive });
      } else if (message.kind === "speed") {
        rate.current = message.rate;
        for (const animation of document.getAnimations()) animation.playbackRate = message.rate;
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <>
      <ScheduleShiftDesignPage />
      <ConfirmDialog
        open={dialog !== null}
        title={dialog?.destructive ? "Delete this draft?" : "Publish this schedule?"}
        description={
          dialog?.destructive
            ? "Week of Aug 17 — v2 will be removed. Published shifts stay."
            : "2 locations and 48 changes."
        }
        confirmLabel={dialog?.destructive ? "Confirm delete" : "Publish"}
        destructive={dialog?.destructive}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          fire(catalogById.get(dialog?.destructive ? "draft-deleted" : "published")!);
        }}
      />
    </>
  );
}

/* ---------- Controls: trigger panel + stage / states board ---------- */

const viewports = [
  { label: "Desktop", width: "100%" },
  { label: "Tablet 768", width: "768px" },
  { label: "Phone 375", width: "375px" },
] as const;

const speeds = [1, 0.5, 0.25] as const;

function FeedbackControls() {
  const stage = useRef<HTMLIFrameElement>(null);
  const [tab, setTab] = useState<"stage" | "states">("stage");
  const [viewport, setViewport] = useState<(typeof viewports)[number]>(viewports[0]);
  const [speed, setSpeed] = useState<number>(1);
  const [filter, setFilter] = useState("");

  const send = (message: StageMessage) => {
    if (tab !== "stage") setTab("stage");
    stage.current?.contentWindow?.postMessage(message, window.location.origin);
  };

  const groups = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const map = new Map<string, ToastEntry[]>();
    for (const entry of toastCatalog) {
      if (query && !`${entry.title} ${entry.description ?? ""} ${entry.trigger}`.toLowerCase().includes(query)) continue;
      map.set(entry.screen, [...(map.get(entry.screen) ?? []), entry]);
    }
    return [...map];
  }, [filter]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const entry of toastCatalog) result[entry.tone] = (result[entry.tone] ?? 0) + 1;
    return result;
  }, []);

  return (
    <div className="fg-root">
      <aside className="fg-panel" aria-label="Toast triggers">
        <header className="fg-panel-head">
          <h1>Feedback gallery</h1>
          <p>
            {toastCatalog.length} toasts as the app shows them today ·{" "}
            {Object.entries(counts).map(([tone, count]) => (
              <span key={tone} className={`fg-count fg-tone-${tone}`}>
                {count} {tone}
              </span>
            ))}
          </p>
          <input
            className="fg-search"
            type="search"
            placeholder="Filter toasts…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </header>
        <div className="fg-scenarios">
          <button type="button" onClick={() => send({ kind: "stack" })}>Stack 5 toasts</button>
          <button type="button" onClick={() => send({ kind: "dedupe" })}>Same error ×3</button>
          <button type="button" onClick={() => send({ kind: "dialog", destructive: false })}>Open dialog</button>
          <button type="button" onClick={() => send({ kind: "dialog", destructive: true })}>Open delete dialog</button>
          <button type="button" onClick={() => send({ kind: "clear" })}>Clear toasts</button>
        </div>
        {groups.map(([screen, entries]) => (
          <section key={screen} className="fg-group">
            <h2>{screen}</h2>
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button type="button" className="fg-trigger" onClick={() => send({ kind: "toast", id: entry.id })}>
                    <span className={`fg-dot fg-tone-${entry.tone}`} aria-hidden />
                    <span className="fg-trigger-text">
                      <strong>{entry.title}</strong>
                      <small>{entry.trigger}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>

      <main className="fg-main">
        <div className="fg-toolbar">
          <div className="fg-segment" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={tab === "stage"} onClick={() => setTab("stage")}>Live stage</button>
            <button type="button" role="tab" aria-selected={tab === "states"} onClick={() => setTab("states")}>States board</button>
          </div>
          <div className="fg-segment" aria-label="Viewport">
            {viewports.map((item) => (
              <button key={item.label} type="button" aria-pressed={viewport === item} onClick={() => setViewport(item)}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="fg-segment" aria-label="Animation speed">
            {speeds.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={speed === rate}
                onClick={() => {
                  setSpeed(rate);
                  send({ kind: "speed", rate });
                }}
              >
                {rate}×
              </button>
            ))}
          </div>
        </div>

        <div className="fg-stage-wrap" hidden={tab !== "stage"}>
          <iframe
            ref={stage}
            className="fg-stage"
            style={{ width: viewport.width }}
            src="/dev/feedback?frame=1"
            title="Live stage: Schedule preview"
            onLoad={() => send({ kind: "speed", rate: speed })}
          />
        </div>
        {tab === "states" ? <StatesBoard /> : null}
      </main>
    </div>
  );
}

/* ---------- States board: every non-toast state, drawn with today's markup ---------- */

function Card({ title, where, children, wide }: { title: string; where: string; children: ReactNode; wide?: boolean }) {
  return (
    <figure className={wide ? "fg-card fg-card-wide" : "fg-card"}>
      <div className="fg-card-body">{children}</div>
      <figcaption>
        <strong>{title}</strong>
        <span>{where}</span>
      </figcaption>
    </figure>
  );
}

function Missing({ title, today }: { title: string; today: string }) {
  return (
    <figure className="fg-card fg-card-missing">
      <div className="fg-card-body">
        <strong>Not built</strong>
        <p>{today}</p>
      </div>
      <figcaption>
        <strong>{title}</strong>
        <span>Missing today</span>
      </figcaption>
    </figure>
  );
}

function StatesBoard() {
  const [offline, setOffline] = useState(true);
  const noop = () => undefined;
  return (
    <div className="fg-board">
      <section>
        <h2>Loading</h2>
        <div className="fg-grid">
          <Card title="Page switch" where="Every lazy screen · App.tsx Suspense">
            <main className="auth-loading fg-fill" aria-label="Loading page" />
          </Card>
          <Card title="Schedule loading" where="Schedule">
            <ListOutline label="Loading Schedule" rows={8} columns={8} />
          </Card>
          <Card title="Employee Hub skeleton" where="Employee Hub">
            <LoadingOutline label="Loading Employee Hub" className="eh-loading">
              <Skeleton width={300} height={28} style={{ maxWidth: "100%", margin: "24px 0", borderRadius: 10 }} />
              <Skeleton width="100%" height={260} style={{ borderRadius: 20 }} />
            </LoadingOutline>
          </Card>
          <Card title="Shift Hub skeleton" where="Shift changes">
            <div className="sx-root sx-skeleton" role="status">
              <div />
              <div />
              <div />
            </div>
          </Card>
          <Card title="Settings loading" where="Settings › Locations, Shift types, Documents…">
            <p className="settings-state">Loading locations...</p>
          </Card>
          <Card title="Team structure loading" where="Settings › Jobs">
            <div className="job-empty-state" role="status">Loading your team structure…</div>
          </Card>
          <Card title="Publish preview loading" where="Schedule › Publish">
            <LinesOutline label="Loading publish preview" />
          </Card>
          <Card title="Button while saving" where="Most forms">
            <div className="fg-row">
              <Button disabled>Saving…</Button>
              <Button disabled>Saving...</Button>
              <button type="button" className="secondary-button" disabled>Deleting…</button>
            </div>
          </Card>
          <Card title="Account check" where="Workspaces hub, Welcome" wide>
            <div className="fg-frame">
              <PreBizFrame titleId="fg-checking" title="Checking your account" />
            </div>
          </Card>
        </div>
      </section>

      <section>
        <h2>Errors</h2>
        <div className="fg-grid">
          <Card title="Schedule failed" where="Schedule">
            <LoadError title="We couldn't load Schedule" detail="This week's shifts didn't load. Nothing was changed." onRetry={noop} />
          </Card>
          <Card title="Employee Hub failed" where="Employee Hub">
            <LoadError title="We couldn't load Employee Hub" detail="Your day didn't load. Nothing was changed." onRetry={noop} />
          </Card>
          <Card title="Shift Hub failed" where="Shift changes">
            <div className="sx-root sx-empty">
              <h2>Shift Hub is unavailable</h2>
              <p role="alert">Unable to load shift changes</p>
              <button type="button"><RefreshCw size={16} /> Retry</button>
            </div>
          </Card>
          <Card title="Dashboard panel failed" where="Employee Hub › a card">
            <LoadError inset level={3} title="We couldn't load your updates" detail="Your updates didn't load. Nothing was changed." onRetry={noop} />
          </Card>
          <Card title="Settings failed" where="Settings pages">
            <p className="settings-state error">Failed to fetch</p>
          </Card>
          <Card title="Jobs failed" where="Settings › Jobs">
            <div className="job-error" role="alert">Failed to fetch <button type="button">Try again</button></div>
          </Card>
          <Card title="Publish preview failed" where="Schedule › Publish">
            <LoadError inset level={3} title="We couldn't load the publish preview" detail="The publish preview didn't load. Nothing was published." onRetry={noop} />
          </Card>
          <Card title="Form error" where="~40 forms">
            <p className="form-error">A template with this name already exists.</p>
          </Card>
          <Card title="Workspace didn't load" where="After sign-in" wide>
            <div className="fg-frame">
              <PreBizFrame
                titleId="fg-ws-error"
                title="That workspace didn't load"
                description="Something went wrong on our side, not yours. Try again, or pick a different workspace."
              >
                <div className="pb-footer">
                  <button className="pb-btn pb-btn-primary" type="button">Try again</button>
                </div>
              </PreBizFrame>
            </div>
          </Card>
          <Missing title="Page crashed" today="The screen goes blank white. Nothing to click." />
          <Missing title="Page not found" today="A wrong address silently lands on the Schedule." />
          <Missing title="No access" today="A screen you can't open silently sends you home." />
        </div>
      </section>

      <section>
        <h2>Empty</h2>
        <div className="fg-grid">
          <Card title="No locations" where="Settings › Locations">
            <div className="settings-empty">
              <MapPin size={22} aria-hidden />
              <strong>No locations yet</strong>
              <p>Add the first restaurant location to establish scheduling context.</p>
            </div>
          </Card>
          <Card title="No jobs" where="Settings › Jobs">
            <div className="job-empty-state">
              <BriefcaseBusiness size={26} />
              <h2>Build your team structure</h2>
              <p>Start with a department, then add the jobs your team does.</p>
            </div>
          </Card>
          <Card title="No employees" where="Employees">
            <div className="employees-empty">
              <Users size={24} aria-hidden />
              <strong>No matching employees</strong>
            </div>
          </Card>
          <Card title="No requests" where="Schedule › Requests">
            <div className="requests-empty">
              <Check size={22} />
              <strong>Queue clear</strong>
              <span>No requests match these filters.</span>
            </div>
          </Card>
        </div>
      </section>

      <section>
        <h2>
          Banners &amp; connection
          <label className="fg-toggle">
            <input type="checkbox" checked={offline} onChange={(event) => setOffline(event.target.checked)} />
            Offline
          </label>
        </h2>
        <div className="fg-grid">
          <Card title="Employee Hub notice" where="Employee Hub">
            <div className="eh-notice" role="status">
              {offline ? "You’re offline. Showing your last loaded schedule." : "Your schedule may be out of date."}{" "}
              <button type="button">Refresh schedule</button>
            </div>
          </Card>
          <Card title="Shift Hub banner" where="Shift changes">
            <div className="sx-root">
              {offline ? (
                <p className="sx-banner" role="status">
                  You’re offline. Showing the last loaded requests. Reconnect to make changes.
                </p>
              ) : (
                <p className="sx-banner" role="alert">
                  Couldn’t refresh these requests. <button type="button">Retry</button>
                </p>
              )}
            </div>
          </Card>
          <Card title="Shift Hub success / error" where="Shift changes">
            <div className="sx-root fg-stack">
              <p className="sx-notice" role="status"><Check size={17} />Swap sent to Maya.</p>
              <p className="sx-error" role="alert">This shift already has a pending swap.</p>
            </div>
          </Card>
          <Card title="Schedule operation error" where="Schedule (top of grid)">
            <div className="schedule-operation-error" role="alert">
              This draft changed in another tab. Reload to continue.
              <button type="button" aria-label="Dismiss error"><X size={15} /></button>
            </div>
          </Card>
          <Card title="Account notice" where="Account › Security">
            <div className="account-notice">
              <strong>Verify maya@bistro.com</strong>
              <p>Both your current and new email must confirm. Your current email stays active until then.</p>
              <div className="account-button-row">
                <Button>Resend</Button>
                <Button className="danger-button">Cancel change</Button>
              </div>
            </div>
          </Card>
          <Card title="Form success" where="Account, Settings forms">
            <p className="form-success">Verification links sent again</p>
          </Card>
          <Missing
            title="Offline on other screens"
            today="Schedule, Settings, Employees and the rest show nothing when the connection drops. Live updates failing is never shown."
          />
        </div>
      </section>
    </div>
  );
}
