import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { useConfirmClick } from "@newfork/ui";
export function CatalogRowMenu({
  name,
  children,
  create = false,
}: {
  name: string;
  children: ReactNode;
  create?: boolean;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node))
        ref.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      className={`job-row-menu${create ? " job-create-menu" : ""}`}
      ref={ref}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          ref.current?.removeAttribute("open");
          ref.current?.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        role="button"
        className={create ? "job-primary-button" : undefined}
        aria-label={create ? "Add" : `Actions for ${name}`}
        title={create ? "Add department or job" : `Actions for ${name}`}
      >
        {create ? (
          <>
            <Plus size={16} />
            Add
            <ChevronDown size={14} />
          </>
        ) : (
          <MoreHorizontal size={18} />
        )}
      </summary>
      <div
        className="job-menu-popover"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button:not(:disabled)")) {
            ref.current?.removeAttribute("open");
            ref.current
              ?.querySelector("summary")
              ?.focus({ preventScroll: true });
          }
        }}
      >
        {children}
      </div>
    </details>
  );
}

// Archive in a Settings row menu takes two clicks: red "Archive" arms,
// "Confirm archive" archives (BL-595). Restore stays one click.
export function CatalogArchiveButton({
  archived,
  name,
  disabled = false,
  title,
  onToggle,
}: {
  archived: boolean;
  /** Adds the row's name to the accessible label, e.g. "Archive Prep". */
  name?: string;
  disabled?: boolean;
  title?: string;
  onToggle: () => void;
}) {
  const { armed, confirmProps } = useConfirmClick(onToggle);
  const named = (label: string) => (name ? `${label} ${name}` : undefined);
  if (archived) {
    return (
      <button
        type="button"
        aria-label={named("Restore")}
        disabled={disabled}
        title={title}
        onClick={onToggle}
      >
        Restore
      </button>
    );
  }
  const label = armed ? "Confirm archive" : "Archive";
  return (
    <>
      <button
        type="button"
        className="job-danger-text"
        aria-label={named(label)}
        disabled={disabled}
        title={title}
        data-confirming={armed}
        {...confirmProps}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          // Only the confirming click may close the menu.
          if (!armed || event.detail > 1) event.stopPropagation();
          confirmProps.onClick(event);
        }}
      >
        {label}
      </button>
      <span className="sr-only" role="status">
        {armed ? "Confirm archive" : ""}
      </span>
    </>
  );
}
