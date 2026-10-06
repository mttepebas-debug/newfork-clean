import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import {
  categoryInUse,
  globalPrivacyControl,
  onPrivacyPanel,
  readConsent,
  STORAGE_KEY,
  subscribeConsent,
  writeConsent,
} from "../privacy/consent";

const NOTICE_DELAY_MS = 1200;

function useConsentRecord() {
  return useSyncExternalStore(
    subscribeConsent,
    () => readConsent()?.decidedAt ?? null,
    () => "server",
  );
}

/** Dialog listing what this site stores; reachable from the notice and the footer. */
function ChoicesDialog({ onClose }: { readonly onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const gpc = globalPrivacyControl();

  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  const categories = [
    {
      id: "necessary",
      name: "Strictly necessary",
      state: "Always on",
      on: true,
      disabled: true,
      text: `Remembers the choice you make here, on this device only (browser storage key "${STORAGE_KEY}").`,
    },
    {
      id: "analytics",
      name: "Analytics",
      state: categoryInUse("analytics") ? "Optional" : "Not used on this site",
      on: false,
      disabled: !categoryInUse("analytics"),
      text: "Measuring visits and page use. This site loads no analytics tools today.",
    },
    {
      id: "marketing",
      name: "Advertising",
      state: categoryInUse("marketing") ? "Optional" : "Not used on this site",
      on: false,
      disabled: !categoryInUse("marketing"),
      text: "Ad pixels and cross-site tracking. This site loads none.",
    },
  ];

  return (
    <div className="choices-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={ref} className="choices" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="choices__head">
          <h2 id={titleId}>Cookie settings</h2>
          <button type="button" className="choices__close" onClick={onClose} aria-label="Close cookie settings">
            ×
          </button>
        </div>
        <p className="choices__intro">
          This website works without tracking. Here is everything it stores in your browser, and what it doesn't.
        </p>
        <ul className="choices__list">
          {categories.map((category) => (
            <li key={category.id} className="choices__item">
              <div>
                <p className="choices__name">{category.name}</p>
                <p className="choices__text">{category.text}</p>
              </div>
              <label className="switch">
                <input type="checkbox" checked={category.on} disabled={category.disabled} readOnly aria-describedby={`${titleId}-${category.id}`} />
                <span className="switch__track" aria-hidden="true" />
                <span className="switch__label" id={`${titleId}-${category.id}`}>
                  {category.state}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {gpc ? (
          <p className="choices__gpc">Your browser sends Global Privacy Control. We treat it as an opt-out of any sale or sharing of personal information.</p>
        ) : null}
        <div className="choices__actions">
          <Link to="/cookies" className="text-link" onClick={onClose}>
            Read the Cookie Policy
          </Link>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              writeConsent({ analytics: false, marketing: false });
              onClose();
            }}
          >
            Save and close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A small, honest notice on the first visit (no tracking here) plus the
 * settings dialog. Nothing is blocked while it shows.
 */
export function PrivacyChoices() {
  const decided = useConsentRecord();
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), NOTICE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => onPrivacyPanel(setPanel), []);

  const showNotice = ready && decided === null && !panel;

  return (
    <>
      {showNotice ? (
        <section className="cookie-notice" aria-label="Cookies on this site">
          <p>
            <strong>No tracking here.</strong> This site uses no analytics or advertising cookies, only what it needs to work.{" "}
            <Link to="/cookies" className="text-link">
              Cookie Policy
            </Link>
          </p>
          <div className="cookie-notice__actions">
            <button type="button" className="btn btn--secondary btn--small" onClick={() => setPanel(true)}>
              Settings
            </button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => writeConsent({ analytics: false, marketing: false })}
            >
              OK
            </button>
          </div>
        </section>
      ) : null}
      {panel ? <ChoicesDialog onClose={() => setPanel(false)} /> : null}
    </>
  );
}
