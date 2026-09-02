import type { JSX } from "react";
import { RotateCcw } from "lucide-react";

interface WorkingCopyBannerProps {
  readonly isDiscarding?: boolean;
  readonly onDiscard: () => void;
}

export function WorkingCopyBanner({
  isDiscarding = false,
  onDiscard,
}: WorkingCopyBannerProps): JSX.Element {
  return (
    <div className="schedule-working-copy-banner">
      <div>
        You are editing the live schedule. Changes apply only when you publish.
      </div>
      <button type="button" disabled={isDiscarding} onClick={onDiscard}>
        <RotateCcw aria-hidden="true" className="schedule-working-copy-icon" />
        Discard
      </button>
    </div>
  );
}
