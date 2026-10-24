import { ArrowLeft, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { WindowAlert } from "../../shell/WindowAlert";
import { usePullToClose } from "./usePullToClose";
import "./shift-release.css";

// One window language for the shift change plan (Mert, 2026-10-13 10:31): a small
// centred eyebrow, the names below it, the body, a grey foot that says what
// happens. A bottom sheet on the phone, with a grip on top: pulled down, it closes (Mert 2026-10-24).

const FOCUSABLE =
  "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]";

export function PlanDialog({
  eyebrow,
  names,
  children,
  foot,
  alert,
  onClose,
  onBack,
  busy = false,
}: {
  eyebrow: string;
  names?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  /** The window's own refusal, in its band over the body's bottom edge (UI-FIELDMSG-2). */
  alert?: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pull = usePullToClose(ref, onClose, { handle: ".sx-w-head", scroller: ".sx-w-body", off: busy });
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal?.();
    return () => {
      dialog?.close?.();
      if (before?.isConnected && !before.matches(":disabled")) before.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="sx-dialog sx-root sx-plan-dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
          (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last && first) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      {...pull}
    >
      <div className="sx-w">
        <header className="sx-w-head">
          <span className="sx-w-grip" aria-hidden />
          {onBack ? (
            <button type="button" className="sx-w-icon" aria-label="Back" disabled={busy} onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <h2 id={titleId}>{eyebrow}</h2>
          <button type="button" className="sx-w-icon" data-end aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {names ? <p className="sx-w-names">{names}</p> : null}
        <div className="sx-w-body">{children}</div>
        {foot ? (
          <footer className="sx-w-foot">
            <WindowAlert message={alert} />
            {foot}
          </footer>
        ) : (
          <WindowAlert between message={alert} />
        )}
      </div>
    </dialog>,
    document.body,
  );
}
