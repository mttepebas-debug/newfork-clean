import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The new Time off's window: a drawer from the right on a computer, a sheet from the bottom on a phone.
 * A modal <dialog>: the page behind is inert, Escape and a click outside close it (not while busy), and
 * focus goes back to what opened it.
 */
export function TimeOffSheet({
  title,
  phone,
  busy = false,
  onClose,
  children,
  footer,
}: {
  title: string;
  phone: boolean;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (dialog && typeof dialog.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    const main = document.querySelector<HTMLElement>(".app-main");
    const overflow = main?.style.overflow ?? "";
    if (main) main.style.overflow = "hidden";
    return () => {
      if (dialog?.open && typeof dialog.close === "function") dialog.close();
      if (main) main.style.overflow = overflow;
      queueMicrotask(() => {
        if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
      });
    };
  }, []);

  return createPortal(
    <dialog
      ref={ref}
      className={`tor-sheet${phone ? " is-phone" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busyRef.current) onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog itself.
        if (event.target === event.currentTarget && !busyRef.current) onClose();
      }}
    >
      <div className="tor-sheet-inner">
        {phone ? <span className="tor-grab" aria-hidden /> : null}
        <div className="tor-sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="tor-iconbtn" aria-label="Close" onClick={onClose} disabled={busy}>
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="tor-sheet-body">{children}</div>
        {footer ? <div className="tor-sheet-foot">{footer}</div> : null}
      </div>
    </dialog>,
    document.body,
  );
}
