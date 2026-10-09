import { createContext, useContext, useEffect, useId, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";

export interface AppSidebarPanelHost {
  readonly target: HTMLDivElement | null;
  readonly collapsed: boolean;
  readonly setCollapsed: Dispatch<SetStateAction<boolean>>;
  readonly setOwner: Dispatch<SetStateAction<string | null>>;
}

export const AppSidebarPanelContext = createContext<AppSidebarPanelHost | null>(null);

/** A nonmodal slot in the existing app sidebar, not an overlay over page content. */
export function AppSidebarPanel({ children }: {
  readonly children: (state: { collapsed: boolean; onToggle: () => void }) => ReactNode;
}) {
  const host = useContext(AppSidebarPanelContext);
  const owner = useId();
  const setOwner = host?.setOwner;
  const setCollapsed = host?.setCollapsed;
  useEffect(() => {
    if (!setOwner || !setCollapsed) return;
    setCollapsed(false);
    setOwner(owner);
    return () => setOwner(current => current === owner ? null : current);
  }, [owner, setOwner, setCollapsed]);
  if (!host?.target) return null;
  return createPortal(children({ collapsed: host.collapsed, onToggle: () => host.setCollapsed(value => !value) }), host.target);
}
