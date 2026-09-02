import { type ReactElement, cloneElement, useEffect, useRef, useState } from "react";

export function BulkPublishPopover({
  count,
  locationBreakdown,
  isPublishing,
  onConfirm,
  trigger,
  disabled = false,
}: {
  readonly count: number;
  readonly locationBreakdown: ReadonlyMap<string, number>;
  readonly isPublishing: boolean;
  readonly onConfirm: () => void;
  readonly trigger: ReactElement<{ onClick?: () => void; disabled?: boolean }>;
  readonly disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const breakdown = Array.from(locationBreakdown.entries())
    .map(([name, draftCount]) => `${name} ${draftCount}`)
    .join(" · ");

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => cancelRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const triggerElement = cloneElement(trigger, {
    disabled: disabled || trigger.props.disabled,
    onClick: () => {
      trigger.props.onClick?.();
      if (!disabled) setOpen((current) => !current);
    },
  });

  return (
    <div className="schedule-bulk-publish-popover" ref={rootRef}>
      {triggerElement}
      {open && !disabled ? (
        <div
          className="schedule-bulk-publish-panel"
          role="alertdialog"
          aria-label={`Confirm publish ${count} drafts`}
        >
          <strong>
            Publish {count} draft{count !== 1 ? "s" : ""}?
          </strong>
          {breakdown ? <span>{breakdown}</span> : null}
          <div>
            <button
              ref={cancelRef}
              type="button"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isPublishing || count === 0}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              {isPublishing ? "Publishing…" : "Publish"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
