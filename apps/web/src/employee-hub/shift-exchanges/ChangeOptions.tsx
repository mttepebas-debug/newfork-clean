import { AlertTriangle, ArrowLeftRight, ChevronRight, Hand, UserRoundPlus } from "lucide-react";
import type { DecisionTier } from "@newfork/shared";
import { Link } from "react-router";
import "./shift-release.css";

// "Your shift": three named ways to change it (plan 04:01; mockup moment 1).
// Release puts it in the pool, cover asks a teammate, swap trades an agreed shift.
// Nothing opens in the last 4 hours before the shift (plan 04:56).

export type ChangeMode = "release" | "cover" | "swap";
const OPTIONS: { mode: ChangeMode; title: string; text: string; Icon: typeof Hand }[] = [
  { mode: "release", title: "Release shift", text: "Anyone eligible can ask for it", Icon: Hand },
  { mode: "cover", title: "Ask someone to cover", text: "Ask a teammate you choose", Icon: UserRoundPlus },
  { mode: "swap", title: "Swap", text: "Already agreed on a trade", Icon: ArrowLeftRight },
];
export const CLOSE_BEFORE_MS = 4 * 60 * 60 * 1000;

export function ChangeOptions({
  hrefFor,
  closed,
}: {
  hrefFor: (mode: ChangeMode) => string;
  /** Inside the last 4 hours before the shift. */
  closed: boolean;
}) {
  return (
    <div className="sx-opts">
      {closed ? (
        <div className="sx-cks" data-one>
          <span className="sx-ck" data-tone="warn">
            <AlertTriangle aria-hidden />
            <span>
              <strong>Changes are closed</strong>
              <small>They close 4 hours before a shift. Talk to your manager.</small>
            </span>
          </span>
        </div>
      ) : null}
      {OPTIONS.map(({ mode, title, text, Icon }) =>
        closed ? (
          <span key={mode} className="sx-opt" aria-disabled="true">
            <span className="sx-opt-icon" aria-hidden>
              <Icon />
            </span>
            <span>
              <b>{title}</b>
              <span>{text}</span>
            </span>
            <ChevronRight aria-hidden />
          </span>
        ) : (
          <Link key={mode} className="sx-opt" to={hrefFor(mode)}>
            <span className="sx-opt-icon" aria-hidden>
              <Icon />
            </span>
            <span>
              <b>{title}</b>
              <span>{text}</span>
            </span>
            <ChevronRight aria-hidden />
          </Link>
        ),
      )}
    </div>
  );
}

/**
 * KARARLAR S-169: when nobody but the owner can answer a request for this shift,
 * the owner decides it in Requests; nobody else is asked.
 */
export function SelfOnlyNote({ tier }: { tier: DecisionTier | undefined }) {
  return tier === "self_only" ? (
    <p className="sx-help">No one else can approve this. It closes 4 hours before the shift.</p>
  ) : null;
}
