import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { TOAST_LAYER_ATTRIBUTE } from "../shell/toastLayer";
import "./jobs-settings.css";

const focusableSelector =
  'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

/** Shared modal shell; forms supply their header, scrollable body and footer. */
export function CatalogDrawer({
  label,
  children,
  onClose,
  onEscape,
  busy = false,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  onEscape?: () => void;
  busy?: boolean;
  className?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = dialog.current;
    if (!root) return;
    const active = document.activeElement as HTMLElement | null;
    const opener =
      active?.closest(".job-row-menu")?.querySelector<HTMLElement>("summary") ??
      active;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement &&
          element !== root.parentElement &&
          !element.hasAttribute(TOAST_LAYER_ATTRIBUTE),
      )
      .map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";
    root.dataset.initialFocus = "true";
    const initial = root.querySelector<HTMLElement>(
      '[data-drawer-autofocus], input:not(:disabled):not([type="color"]):not([type="checkbox"]):not([type="hidden"]), textarea:not(:disabled)',
    );
    (initial ?? root).focus({ preventScroll: true });
    return () => {
      background.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="catalog-drawer-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          if (!busy) onClose();
        }
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`jobs-settings-page catalog-drawer ${className}`}
        onPointerDown={() => {
          if (dialog.current) delete dialog.current.dataset.initialFocus;
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          // A nested modal (including portaled native dialogs) owns its keys.
          const modal = (event.target as HTMLElement).closest(
            'dialog, [role="dialog"], [role="alertdialog"]',
          );
          if (modal && modal !== dialog.current) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) (onEscape ?? onClose)();
          }
          if (event.key !== "Tab") return;
          const root = dialog.current;
          if (!root) return;
          delete root.dataset.initialFocus;
          const scope =
            root.querySelector<HTMLElement>("[data-discard]") ?? root;
          const elements = Array.from(
            scope.querySelectorAll<HTMLElement>(focusableSelector),
          ).filter(
            (element) =>
              element.getClientRects().length > 0 &&
              !element.closest("[inert]") &&
              !element.matches(":disabled"),
          );
          const first = elements[0],
            last = elements.at(-1);
          if (!first || !last) {
            event.preventDefault();
            root.focus();
          } else if (
            event.shiftKey &&
            (document.activeElement === first ||
              !elements.includes(document.activeElement as HTMLElement))
          ) {
            event.preventDefault();
            last.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              !elements.includes(document.activeElement as HTMLElement))
          ) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
