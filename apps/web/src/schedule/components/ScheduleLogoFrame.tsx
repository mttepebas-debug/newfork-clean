import {
  defaultScheduleLogoPlacement,
  type ScheduleLogoPlacement,
} from "@newfork/shared";
import { useState, type CSSProperties, type ReactNode } from "react";

export const scheduleLogoFrameAspectRatio = "200 / 79";

export function ScheduleLogoFrame({
  logoUrl,
  organizationName,
  placement = defaultScheduleLogoPlacement,
  alt,
  className,
  imageClassName,
  emptyState,
  onClick,
  testId,
  frameTestId,
  fallbackTestId,
  style,
}: {
  readonly logoUrl: string | null;
  readonly organizationName: string;
  readonly placement?: ScheduleLogoPlacement | null;
  readonly alt?: string;
  readonly className?: string;
  readonly imageClassName?: string;
  readonly emptyState?: ReactNode;
  readonly onClick?: () => void;
  readonly testId?: string;
  readonly frameTestId?: string;
  readonly fallbackTestId?: string;
  readonly style?: CSSProperties;
}) {
  const normalizedName = organizationName.trim() || "Workspace";
  const normalizedPlacement = placement ?? defaultScheduleLogoPlacement;
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const visibleLogoUrl = logoUrl && logoUrl !== failedLogoUrl ? logoUrl : null;
  const content = visibleLogoUrl ? (
    <img
      src={visibleLogoUrl}
      alt={alt ?? `${normalizedName} logo`}
      className={imageClassName ?? "schedule-logo-image"}
      data-testid={testId}
      draggable={false}
      onError={() => setFailedLogoUrl(visibleLogoUrl)}
      style={
        {
          "--schedule-logo-scale": normalizedPlacement.scale,
          "--schedule-logo-offset-x": `${normalizedPlacement.offset_x}%`,
          "--schedule-logo-offset-y": `${normalizedPlacement.offset_y}%`,
        } as CSSProperties
      }
    />
  ) : (
    (emptyState ?? (
      <GeneratedOrganizationLogo name={normalizedName} testId={fallbackTestId} />
    ))
  );

  if (!onClick) {
    return (
      <div
        className={className ?? "schedule-logo-frame"}
        data-testid={frameTestId}
        style={style}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className ?? "schedule-logo-frame schedule-logo-button"}
      aria-label="Manage schedule logo"
      title="Manage schedule logo"
      onClick={onClick}
      data-testid={frameTestId}
      data-schedule-logo-upload-trigger="schedule-logo-upload-trigger"
      style={style}
    >
      {content}
      <span
        className="schedule-logo-edit-glyph"
        data-testid="schedule-logo-upload-hover-icon"
        aria-hidden
      >
        Edit
      </span>
    </button>
  );
}

function GeneratedOrganizationLogo({
  name,
  testId,
}: {
  readonly name: string;
  readonly testId?: string;
}) {
  return (
    <div
      className="schedule-generated-logo"
      role="img"
      aria-label={`${name} logo`}
      data-testid={testId}
    >
      <span>{buildInitials(name)}</span>
      {/* A long name is cut; hover shows it whole (QA 50). */}
      <strong title={name}>{name}</strong>
    </div>
  );
}

function buildInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "W";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
}
