import { Button } from "@newfork/ui";
import { AlertTriangle, MessageSquareWarning } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { WindowAlert } from "./WindowAlert";

// The app's own confirm box, used instead of the browser's confirm/prompt.
// Cancel is white, a destructive answer red, any other answer green (REUSE UI-09).
export type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** Red answer and a warning icon; otherwise green and a note icon. */
  readonly destructive?: boolean;
  readonly confirmDisabled?: boolean;
  readonly busy?: boolean;
  /**
   * The answer works in place (LINEUP-E-DESKTOP-EDIT): while busy it reads these words and stays focusable,
   * aria-disabled and aria-busy, so the keyboard's focus doesn't fall to the page; presses wait until it is done.
   * Without it, busy turns both buttons off as before.
   */
  readonly busyLabel?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** Extra fields, e.g. a reason box; give the first one autoFocus. */
  readonly children?: ReactNode;
  /** Why the answer didn't go through: the box's band, over the text above the buttons. */
  readonly error?: ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  confirmDisabled = false,
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
  children,
  error,
}: ConfirmDialogProps) {
  // With busy words the buttons hold focus while busy (aria-disabled); without them they turn off.
  const holding = busy && busyLabel !== undefined;
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLElement>(null);
  // Read at key time, so a new onCancel each render does not re-run the effect.
  const latest = useRef({ busy, onCancel });
  latest.current = { busy, onCancel };
  // Who opened the box, read while rendering: by the effect an autoFocus field
  // inside the box already holds focus, and focus would fall to the page (BL-656).
  const opener = useRef<HTMLElement | null>(null);
  if (!open) opener.current = null;
  else opener.current ??= document.activeElement as HTMLElement | null;

  useEffect(() => {
    if (!open) return undefined;
    const previous = opener.current;
    if (!dialog.current?.contains(document.activeElement)) {
      dialog.current?.querySelector<HTMLElement>(".secondary-button")?.focus();
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialog.current) return;
      // Keep Tab inside the box while it is open.
      const focusable = [
        ...dialog.current.querySelectorAll<HTMLElement>(
          "button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ),
      ];
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
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="app-confirm-layer" role="presentation">
      {/* A click outside is a mouse-only Cancel; keyboards have Escape. */}
      <div
        className="app-confirm-backdrop"
        aria-hidden
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <section
        ref={dialog}
        className="app-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <header>
          <span aria-hidden data-tone={destructive ? "danger" : "info"}>
            {destructive ? (
              <AlertTriangle size={18} />
            ) : (
              <MessageSquareWarning size={18} />
            )}
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
            {children}
          </div>
        </header>
        <footer>
          <WindowAlert message={error} />
          <Button
            className="secondary-button"
            {...(holding ? { "aria-disabled": true } : { disabled: busy })}
            onClick={() => {
              if (!busy) onCancel();
            }}
          >
            {cancelLabel}
          </Button>
          <Button
            className={destructive ? "danger-button" : undefined}
            {...(holding ? { "aria-disabled": true, "aria-busy": true, disabled: confirmDisabled } : { disabled: busy || confirmDisabled })}
            onClick={() => {
              if (!busy && !confirmDisabled) onConfirm();
            }}
          >
            {holding ? busyLabel : confirmLabel}
          </Button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

type Ask = Omit<ConfirmDialogProps, "open" | "onConfirm" | "onCancel" | "children">;

/**
 * `await confirm({...})` for code that used `window.confirm`: resolves true on
 * the answer, false on Cancel, Escape or the backdrop. Render `dialog` once.
 */
export function useConfirmDialog() {
  const [pending, setPending] = useState<
    (Ask & { resolve: (answer: boolean) => void }) | null
  >(null);
  const confirm = useCallback(
    (ask: Ask) =>
      new Promise<boolean>((resolve) => setPending({ ...ask, resolve })),
    [],
  );
  const settle = (answer: boolean) => {
    pending?.resolve(answer);
    setPending(null);
  };
  const dialog = pending ? (
    <ConfirmDialog
      {...pending}
      open
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;
  return { confirm, dialog };
}
