import { Cookie } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export const cookieNoticeStorageKey = "newfork.cookie-notice";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(cookieNoticeStorageKey) === "seen";
  } catch {
    return false;
  }
}

// Newfork only uses essential storage, so this is a notice, not a consent
// switch: offering "Reject" would imply optional tracking exists.
export function CookieNotice() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(cookieNoticeStorageKey, "seen");
    } catch {
      // Storage blocked: the notice simply returns on the next visit.
    }
    setDismissed(true);
  };

  return (
    <aside className="lp-cookie" aria-label="Cookie notice">
      <Cookie size={20} aria-hidden />
      <p>
        We only use essential cookies and storage to keep you signed in. No ads,
        no tracking. <Link to="/cookies">Cookie policy</Link>
      </p>
      <button type="button" className="lp-btn lp-btn-primary lp-btn-sm" onClick={dismiss}>
        Got it
      </button>
    </aside>
  );
}
