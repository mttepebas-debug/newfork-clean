import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal, Plus } from "lucide-react";
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
