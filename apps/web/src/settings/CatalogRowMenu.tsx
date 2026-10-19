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
    // The open menu is pinned to the window, so it would part from its row
    // when the list scrolls or the window resizes: it closes instead.
    const drop = (event: Event) => {
      const popover = ref.current?.querySelector(".job-menu-popover");
      const inside =
        event.target instanceof Node && popover?.contains(event.target);
      if (ref.current?.open && !inside) ref.current.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("scroll", drop, true);
    window.addEventListener("resize", drop);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("scroll", drop, true);
      window.removeEventListener("resize", drop);
    };
  }, []);
  // The menu opens below its button, or above it when the window has no
  // room below. It is pinned to the window (position: fixed) so a scrolling
  // list frame never hides it and the frozen toolbar or column headings never
  // cover it (Settings → Documents, "Hepsinde sabit").
  const open = (event: MouseEvent<HTMLElement>) => {
    const menu = ref.current;
    const popover = menu?.querySelector<HTMLElement>(".job-menu-popover");
    if (!menu || !popover || menu.open) return;
    event.preventDefault();
    menu.open = true;
    const button = event.currentTarget.getBoundingClientRect();
    const height = popover.offsetHeight;
    const room = window.innerHeight - 8;
    const above = button.top - 2 - height;
    const top =
      button.bottom + 2 + height > room && above >= 8
        ? above
        : button.bottom + 2;
    popover.style.position = "fixed";
    popover.style.top = `${top}px`;
    popover.style.right = `${document.documentElement.clientWidth - button.right}px`;
  };
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
        onClick={open}
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
  confirmLabel = "Confirm archive",
  onArmedChange,
  onToggle,
}: {
  archived: boolean;
  /** Adds the row's name to the accessible label, e.g. "Archive Prep". */
  name?: string;
  disabled?: boolean;
  title?: string;
  /** The confirming click's words, e.g. what archiving stops (BL-821). */
  confirmLabel?: string;
  onArmedChange?: (armed: boolean) => void;
  onToggle: () => void;
}) {
  const { armed, confirmProps } = useConfirmClick(onToggle);
  useEffect(() => onArmedChange?.(armed), [armed, onArmedChange]);
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
  const label = armed ? confirmLabel : "Archive";
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
        {armed ? confirmLabel : ""}
      </span>
    </>
  );
}
