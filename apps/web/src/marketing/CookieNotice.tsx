import { Cookie } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export const COOKIE_NOTICE_KEY = "newfork.cookie-notice";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Newfork only uses essential storage, so there is nothing to opt into or out
 * of: the notice says so once and remembers that it was read.
 */
export function CookieNotice() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;
  return (
    <aside className="lp-cookie" aria-label="Cookie notice">
      <Cookie size={18} aria-hidden />
      <p>
        We only use essential storage to keep you signed in. No ads, no
        tracking. <Link to="/cookies">Cookie policy</Link>
      </p>
      <button
        className="lp-btn lp-btn-primary lp-btn-sm"
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(COOKIE_NOTICE_KEY, "1");
          } catch {
            // Private mode: the notice simply shows again next visit.
          }
          setDismissed(true);
        }}
      >
        OK
      </button>
    </aside>
  );
}
