import { Component, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { LoadError } from "./LoadState";
import { staleChunkReloadPending } from "./stale-chunk-reload";

/**
 * What the app shows when a page throws while it draws (BL-1075). Without it
 * React takes the whole app off the screen and leaves it white. The card is
 * LoadError's, with Mert's words: "Something went wrong", a green Reload page
 * and a white Back to Home. Sentry already hears every caught error from
 * createRoot's onCaughtError (main.tsx), so nothing is reported here.
 *
 * Two layers: PageCrashBoundary sits in the page area of the shell, so the
 * menus stay and moving to another page clears the card; AppCrashBoundary
 * holds the whole app and fills the screen when nothing around it is left.
 */

type BoundaryProps = {
  readonly children: ReactNode;
  /** Changes on every move to a page; a new value clears the card. */
  readonly resetKey: string;
  readonly fallback: ReactNode;
};

type BoundaryState = { readonly failed: boolean };

class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  // Only a card already on screen clears: the update that caught the error
  // also sees a new resetKey (the move onto the broken page), and clearing
  // there would draw the page again and report the crash twice.
  override componentDidUpdate(previous: BoundaryProps, previousState: BoundaryState): void {
    if (previousState.failed && this.state.failed && previous.resetKey !== this.props.resetKey)
      this.setState({ failed: false });
  }

  // A reload for a new build is on its way: nothing in the page's place
  // rather than a card that flashes before the page comes back.
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return staleChunkReloadPending() ? null : this.props.fallback;
  }
}

function reloadPage(): void {
  window.location.reload();
}

function CrashCard({
  homeHref,
  reload,
}: {
  readonly homeHref: string;
  readonly reload: () => void;
}) {
  return (
    <LoadError
      title="Something went wrong"
      detail="This page could not open. Nothing was changed."
      actions={
        <>
          <button type="button" className="nf-button" onClick={reload}>
            Reload page
          </button>
          <Link className="nf-button secondary-button" to={homeHref}>
            Back to Home
          </Link>
        </>
      }
    />
  );
}

/** The shell's page area: the card takes the page's place, the menus stay. */
export function PageCrashBoundary({
  children,
  homeHref,
  reload = reloadPage,
}: {
  readonly children: ReactNode;
  /** A page the person can open; the shell passes noAccessHomePath's. */
  readonly homeHref: string;
  readonly reload?: () => void;
}) {
  const { key } = useLocation();
  return (
    <Boundary
      resetKey={key}
      fallback={
        // One child of the page area, so load-state.css centres the card in it.
        <div className="page-crash">
          <CrashCard homeHref={homeHref} reload={reload} />
        </div>
      }
    >
      {children}
    </Boundary>
  );
}

/** The whole app: no menus are left around the card, so it fills the screen. */
export function AppCrashBoundary({
  children,
  reload = reloadPage,
}: {
  readonly children: ReactNode;
  readonly reload?: () => void;
}) {
  const { key } = useLocation();
  return (
    <Boundary
      resetKey={key}
      fallback={
        <main className="app-crash">
          <CrashCard homeHref="/app" reload={reload} />
        </main>
      }
    >
      {children}
    </Boundary>
  );
}
