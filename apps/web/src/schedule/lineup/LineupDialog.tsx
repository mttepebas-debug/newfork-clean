import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function LineupDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const triggerLabel = trigger?.getAttribute("aria-label");
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        const fallback = triggerLabel
          ? document.querySelector<HTMLElement>(
              `button[aria-label="${CSS.escape(triggerLabel)}"]`,
            )
          : null;
        (trigger?.isConnected
          ? trigger
          : (fallback ?? document.getElementById("lineup-title"))
        )?.focus();
      });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="lu-dialog lineup-dialog"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        close.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close.current();
        }
      }}
    >
      <header>
        <div>
          <span className="lu-eyebrow">DAILY OPERATIONS</span>
          <h2 id={id}>{title}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}
