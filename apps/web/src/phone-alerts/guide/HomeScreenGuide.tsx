import { Button } from "@newfork/ui";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { SafariRelease } from "../install-state";
import { buildStage, type Stage } from "./cards";
import { chipText, glyph, nfIcon, srText } from "./replica";
import { firstStepSet, pictureRelease, safariStepSet, sharesFromPage, stepsFor, type GuideStep, type StepSetKey } from "./steps";
import "./guide.css";

// The Home Screen guide (TELEFON-TUR2, V1 · Adım kartları): iPhone shows alerts only from the Home Screen,
// so Safari or Chrome teaches the way there one card at a time. Each card plays its step once on a large,
// true-to-life drawing and stops; the person moves on with Next. It never asks for permission (K4, K5).

export type GuideBrowser = { readonly browser: "safari" | "chrome"; readonly ios: SafariRelease | null };
export type GuideClose = "x" | "esc" | "done" | "shared";

// What this device remembers about the guide. Storage that is not there (a private tab) forgets, never throws.
const barKey = "newfork.phoneAlerts.barLooksDifferent";
const safariStepsKey = "newfork.phoneAlerts.safariSteps";
const startedKey = "newfork.phoneAlerts.guideStartedAt";
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Nothing kept: the guide starts from its usual steps next time.
  }
}
/** When this device last opened the guide (ms), if it did. */
export function guideStartedAt(): number | null {
  const at = Number(read(startedKey));
  return Number.isFinite(at) && at > 0 ? at : null;
}
export const forgetGuideStart = () => write(startedKey, null);

const canShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** The step set this device uses now, from the browser and what the person chose before. */
export function currentStepSet(where: GuideBrowser): StepSetKey {
  const bar = read(barKey) === "1";
  if (where.browser === "safari" && (read(safariStepsKey) === "1" || bar)) return safariStepSet(where.ios, bar);
  return firstStepSet(where.browser, where.ios, canShare());
}

function chip(step: GuideStep, n: number, state: "todo" | "current" | "done", onOpen?: (n: number) => void) {
  const icon = state === "done" ? glyph("check", 14) : step.glyph === "nf" ? nfIcon(18, 5) : glyph(step.glyph, 16);
  const className = `hsg-chip${state === "current" ? " is-current" : ""}${state === "done" ? " is-done" : ""}`;
  if (onOpen) {
    return (
      <button
        key={n}
        type="button"
        className={className}
        aria-label={`Show step ${n}: ${step.chip}`}
        onClick={() => onOpen(n - 1)}
        dangerouslySetInnerHTML={{ __html: icon }}
      />
    );
  }
  return <span key={n} className={className} role="img" aria-label={`Step ${n}: ${step.chip}`} dangerouslySetInnerHTML={{ __html: icon }} />;
}

/** The person's own rows of step chips; a tap opens the guide on that step. */
export function StepChips({ where, onOpen }: { readonly where: GuideBrowser; readonly onOpen: (index: number) => void }) {
  const steps = stepsFor(currentStepSet(where));
  return <span className="hsg-strip-chips">{steps.map((s, i) => chip(s, i + 1, "todo", onOpen))}</span>;
}

export function HomeScreenGuide({
  where,
  startAt = 0,
  onClose,
}: {
  readonly where: GuideBrowser;
  readonly startAt?: number;
  readonly onClose: (how: GuideClose) => void;
}) {
  const titleId = useId();
  const layer = useRef<HTMLDivElement>(null);
  const stageHost = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const [set, setSet] = useState<StepSetKey>(() => currentStepSet(where));
  const steps = useMemo(() => stepsFor(set), [set]);
  const [index, setIndex] = useState(() => Math.min(Math.max(startAt, 0), steps.length - 1));
  const [direction, setDirection] = useState<"next" | "back" | null>(null);
  const [first, setFirst] = useState(true);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const last = index >= steps.length - 1;
  const ios = pictureRelease(set, where.ios);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;

  useEffect(() => {
    write(startedKey, String(Date.now()));
  }, []);

  // The stage for this card: built at the width there is, played once a moment after the card arrives.
  useLayoutEffect(() => {
    const host = stageHost.current;
    if (!host) return;
    const built = buildStage(step, set, ios, Math.min(358, host.clientWidth || 358));
    host.replaceChildren(built.root);
    stage.current = built;
    const timer = window.setTimeout(() => built.play(), first ? 450 : 300);
    return () => {
      window.clearTimeout(timer);
      built.cancel();
    };
  }, [step, set, ios, first]);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= steps.length || next === index) return;
      setDirection(next > index ? "next" : "back");
      setFirst(false);
      setIndex(next);
    },
    [index, steps.length],
  );

  const finish = () => {
    if (!last) return go(index + 1);
    if (sharesFromPage(set) && canShare()) {
      // Straight from the tap: the share sheet needs it. Whether the person added Newfork, the page cannot know.
      void navigator.share({ title: "Newfork", url: window.location.href }).catch(() => undefined);
      return latestClose.current("shared");
    }
    latestClose.current("done");
  };

  const switchSet = (next: StepSetKey, remember: () => void) => {
    remember();
    setSet(next);
    setFirst(false);
    setDirection(null);
    setIndex(0);
  };

  useEffect(() => {
    layer.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        latestClose.current("esc");
        return;
      }
      const root = layer.current;
      if (!root) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        root.dispatchEvent(new CustomEvent("hsg-arrow", { detail: event.key === "ArrowRight" ? 1 : -1 }));
        return;
      }
      if (event.key !== "Tab") return;
      // Keep Tab inside the guide while it is open.
      const focusable = [...root.querySelectorAll<HTMLElement>("button:not(:disabled)")];
      const head = focusable[0];
      const tail = focusable[focusable.length - 1];
      if (!head || !tail) return;
      const inside = root.contains(document.activeElement) && document.activeElement !== root;
      if (event.shiftKey && (!inside || document.activeElement === head)) {
        event.preventDefault();
        tail.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === tail)) {
        event.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => document.removeEventListener("keydown", keydown, true);
  }, []);

  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    const arrow = (event: Event) => go(index + (event as CustomEvent<number>).detail);
    root.addEventListener("hsg-arrow", arrow);
    return () => root.removeEventListener("hsg-arrow", arrow);
  }, [go, index]);

  // A sideways swipe on the picture is Next or Back too.
  const swipe = useRef<{ x: number; y: number } | null>(null);

  let link: ReactNode = null;
  if (index === 0 && sharesFromPage(set)) {
    link = (
      <button
        type="button"
        className="hsg-link"
        onClick={() => switchSet(safariStepSet(where.ios, read(barKey) === "1"), () => write(safariStepsKey, "1"))}
      >
        Use Safari&rsquo;s menu instead
      </button>
    );
  } else if (index === 0 && (set === "27-compact" || set === "26-compact" || (set === "bar" && where.ios !== 18))) {
    const bar = set === "bar";
    link = (
      <button type="button" className="hsg-link" onClick={() => switchSet(safariStepSet(where.ios, !bar), () => write(barKey, bar ? null : "1"))}>
        {bar ? "Show the usual bar" : "My bar looks different"}
      </button>
    );
  }

  return createPortal(
    <div ref={layer} className="hsg-layer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="hsg-body">
        <div className="hsg-inner">
          <div className="hsg-top">
            <span className="hsg-count">
              Step {index + 1} of {steps.length}
            </span>
            <button type="button" className="hsg-x" aria-label="Close guide" onClick={() => latestClose.current("x")}>
              <span aria-hidden dangerouslySetInnerHTML={{ __html: glyph("x", 20) }} />
            </button>
          </div>
          <h2 className="hsg-title" id={titleId}>
            Add Newfork to your Home Screen
          </h2>
          <p className="hsg-sub">iPhone shows alerts only from the Home Screen.</p>
          <div key={`${set}-${index}`} className={`hsg-card${direction === "next" ? " is-next" : direction === "back" ? " is-back" : ""}`}>
            <div
              ref={stageHost}
              className="hsg-stagehost"
              onPointerDown={(event) => {
                swipe.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const start = swipe.current;
                swipe.current = null;
                if (!start) return;
                const dx = event.clientX - start.x;
                if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(event.clientY - start.y)) return;
                go(index + (dx < 0 ? 1 : -1));
              }}
            />
            <p className="hsg-note">{step.note}</p>
            <h3 className="hsg-step" aria-hidden dangerouslySetInnerHTML={{ __html: chipText(step.title, ios) }} />
            <p className="hsg-l1" dangerouslySetInnerHTML={{ __html: step.sub ? chipText(step.sub, ios) : "" }} />
            <p className="hsg-l2">{link}</p>
            <p className="sr-only" aria-live="polite">
              {`Step ${index + 1} of ${steps.length}: ${srText(step.title)}.`}
            </p>
          </div>
          <div className="hsg-prog" aria-hidden>
            {steps.map((s, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i ? <span dangerouslySetInnerHTML={{ __html: glyph("chevron", 12) }} /> : null}
                {chip(s, i + 1, i < index ? "done" : i === index ? "current" : "todo")}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="hsg-bar">
        <div className="hsg-bar-in">
          <Button className="secondary-button hsg-back" disabled={index === 0} onClick={() => go(index - 1)}>
            Back
          </Button>
          <Button className="secondary-button hsg-replay" aria-label="Replay step" onClick={() => stage.current?.play()}>
            <span aria-hidden dangerouslySetInnerHTML={{ __html: glyph("reload", 20) }} />
          </Button>
          <Button className="hsg-next" onClick={finish}>
            {last ? "Try it now" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** V1-R: after the guide, the steps stay at hand while the person works in the browser's own bar. */
export function GuideStrip({
  where,
  onOpen,
  actions,
}: {
  readonly where: GuideBrowser;
  readonly onOpen: (index: number) => void;
  readonly actions: ReactNode;
}) {
  return (
    <section className="hsg-strip" aria-label="Steps to add Newfork">
      <span className="hsg-strip-label">Your turn</span>
      <StepChips where={where} onOpen={onOpen} />
      <div className="hsg-strip-actions">{actions}</div>
    </section>
  );
}

const SHORT: Record<string, string> = {
  bar: "",
  menu: "Tap Share",
  chrome: "Tap Share at the right of the address bar",
  sheet: "Tap View More, then Add to Home Screen",
  add: "Keep Open as Web App on, tap ✓",
  open: "Open Newfork from your Home Screen",
};

function shortTitle(step: GuideStep, set: StepSetKey): string {
  if (step.kind === "bar") {
    if (set === "27-compact") return "Tap ≡ at the left end of the address bar";
    if (set === "26-compact") return "Tap ••• at the right of the address bar";
    return "Tap Share in the bar at the bottom";
  }
  if (step.kind === "sheet" && (set === "18" || set === "share-18")) return "Scroll down, tap Add to Home Screen";
  if (step.kind === "add" && (set === "18" || set === "share-18")) return "Tap Add at the top right";
  return SHORT[step.kind] ?? step.chip;
}

/**
 * V1-D: back in the browser tab after the guide. The page cannot tell whether Newfork was added, so what
 * is true either way comes first; the steps again are second. `compact` (Home) starts with them folded.
 */
export function ReturnCard({
  where,
  compact,
  onAgain,
  onNotNow,
}: {
  readonly where: GuideBrowser;
  readonly compact: boolean;
  readonly onAgain: () => void;
  readonly onNotNow: () => void;
}) {
  const titleId = useId();
  const set = currentStepSet(where);
  const steps = stepsFor(set);
  const [open, setOpen] = useState(!compact);
  const [more, setMore] = useState(false);
  const browserName = where.browser === "chrome" ? "Chrome" : "Safari";
  return (
    <section className="hsg-ret" aria-labelledby={titleId}>
      <div className="hsg-ret-h">
        <span dangerouslySetInnerHTML={{ __html: nfIcon(48) }} />
        <span>
          <b id={titleId}>Added Newfork?</b>
          <span>Open it from your Home Screen.</span>
        </span>
      </div>
      <p className="hsg-ret-o">Already opened it? Sign in there, then tap Turn on alerts.</p>
      <p className="hsg-warn">
        Still see {browserName}&rsquo;s bar in Newfork? Remove the icon and add it again with Open as Web App on.
      </p>
      <button type="button" className="hsg-ret-tg" aria-expanded={open} onClick={() => setOpen(!open)}>
        Didn&rsquo;t see Add to Home Screen?
        <span aria-hidden dangerouslySetInnerHTML={{ __html: glyph("chevron", 18) }} />
      </button>
      {open ? (
        <>
          <ol className="hsg-ret-steps">
            {steps.map((s, i) => (
              <li key={i}>
                {chip(s, i + 1, "todo")}
                {shortTitle(s, set)}
              </li>
            ))}
          </ol>
          <div className="hsg-ret-links">
            <button type="button" className="hsg-link" aria-expanded={more} onClick={() => setMore(!more)}>
              Still can&rsquo;t find it?
            </button>
            <button type="button" className="hsg-link" onClick={() => setOpen(false)}>
              I already added it
            </button>
          </div>
          {more ? (
            <ul className="hsg-ret-more">
              <li>No Add to Home Screen? Scroll to the end, tap Edit Actions, then add it.</li>
              <li>In a Private tab? Switch to a regular {browserName} tab first.</li>
            </ul>
          ) : null}
        </>
      ) : null}
      <div className="hsg-actions2">
        <Button className="secondary-button" onClick={onNotNow}>
          Not now
        </Button>
        <Button onClick={onAgain}>Show again</Button>
      </div>
    </section>
  );
}

export type GuidePhase = "none" | "strip" | "return";

/**
 * One host's guide: open on a step, the strip after it closes, and the return card once the person comes
 * back to this tab from elsewhere (visibilitychange), since that is all a page can see.
 */
export function useGuideFlow(initial: GuidePhase = "none") {
  const [openAt, setOpenAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<GuidePhase>(initial);
  const left = useRef(false);

  useEffect(() => {
    if (phase === "none") return;
    const change = () => {
      if (document.visibilityState === "hidden") left.current = true;
      else if (left.current) setPhase("return");
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [phase]);

  return {
    openAt,
    phase,
    open: (index = 0) => setOpenAt(index),
    close: () => {
      setOpenAt(null);
      setPhase((current) => (current === "return" ? "return" : "strip"));
    },
    dismiss: () => {
      setOpenAt(null);
      setPhase("none");
      left.current = false;
    },
  };
}
