import {
  defaultScheduleLogoPlacement,
  organizationLogoMaxBytes,
  organizationLogoMimeTypes,
  type ScheduleLogoPlacement,
} from "@newfork/shared";
import {
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ScheduleLogoFrame,
  scheduleLogoFrameAspectRatio,
} from "./ScheduleLogoFrame";

export interface ScheduleLogoSaveDraft {
  readonly file: File | null;
  readonly removeLogo: boolean;
  readonly placement: ScheduleLogoPlacement;
}

const logoEditorFrameStyle = {
  aspectRatio: scheduleLogoFrameAspectRatio,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopStyle: "solid",
  borderRightStyle: "solid",
  borderBottomStyle: "solid",
  borderLeftStyle: "solid",
  borderTopColor: "hsl(var(--foreground) / 0.36)",
  borderRightColor: "hsl(var(--foreground) / 0.36)",
  borderBottomColor: "hsl(var(--foreground) / 0.36)",
  borderLeftColor: "hsl(var(--foreground) / 0.36)",
} as CSSProperties;

function defaultPlacement(): ScheduleLogoPlacement {
  return { ...defaultScheduleLogoPlacement };
}

export function ScheduleLogoUploadDialog({
  open,
  organizationName,
  logoUrl,
  logoPlacement,
  logoFileName,
  logoUpdatedAt,
  error,
  saving,
  onOpenChange,
  onSave,
}: {
  readonly open: boolean;
  readonly organizationName: string;
  readonly logoUrl: string | null;
  readonly logoPlacement?: ScheduleLogoPlacement | null;
  readonly logoFileName?: string | null;
  readonly logoUpdatedAt?: string | null;
  readonly error?: string | null;
  readonly saving: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (draft: ScheduleLogoSaveDraft) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [draftUrl, setDraftUrl] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [placement, setPlacement] = useState<ScheduleLogoPlacement>(
    logoPlacement ?? defaultPlacement(),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftFile(null);
    setRemoveLogo(false);
    setPlacement(logoPlacement ?? defaultPlacement());
    setLocalError(null);
  }, [logoPlacement, open]);

  useEffect(() => {
    if (!draftFile) {
      setDraftUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(draftFile);
    setDraftUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [draftFile]);

  if (!open) return null;

  const activeLogoUrl = removeLogo ? null : (draftUrl ?? logoUrl);
  const activeFileName = removeLogo
    ? "Logo will be removed"
    : (draftFile?.name ?? logoFileName ?? "Workspace logo");
  const updatedLabel = logoUpdatedAt
    ? formatLogoUpdatedAt(logoUpdatedAt)
    : null;
  const canSave = !saving && (Boolean(activeLogoUrl) || removeLogo);
  const shownError = localError ?? error ?? null;

  function close(): void {
    if (!saving) onOpenChange(false);
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    const validationError = validateLogoFile(file);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    setDraftFile(file);
    setRemoveLogo(false);
    setPlacement(defaultPlacement());
  }

  function updatePlacement(patch: Partial<ScheduleLogoPlacement>): void {
    setPlacement((current) => ({ ...current, ...patch }));
  }

  return (
    <div className="schedule-logo-dialog-layer" role="presentation">
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close logo dialog"
        onClick={close}
      />
      <section
        className="schedule-logo-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-logo-dialog-title"
      >
        <h2 id="schedule-logo-dialog-title" className="sr-only">
          Schedule logo
        </h2>
        <button
          type="button"
          className="icon-button schedule-logo-close-button"
          aria-label="Close"
          onClick={close}
        >
          <X size={18} aria-hidden />
        </button>

        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          aria-label="Upload schedule logo file"
          accept={organizationLogoMimeTypes.join(",")}
          disabled={saving}
          onChange={handleFile}
        />

        <ScheduleLogoFrame
          logoUrl={activeLogoUrl}
          organizationName={organizationName}
          placement={placement}
          className="schedule-logo-editor-frame"
          imageClassName="schedule-logo-image"
          testId="schedule-logo-editor-preview-image"
          frameTestId="schedule-logo-editor-reference-frame"
          fallbackTestId="schedule-logo-editor-generated-preview"
          style={logoEditorFrameStyle}
        />

        <div className="schedule-logo-file-row">
          <div>
            <strong>{activeFileName}</strong>
            <span>SVG, PNG, JPEG, or WebP under 5 MB.</span>
            {updatedLabel && !draftFile && !removeLogo ? (
              <span>{updatedLabel}</span>
            ) : null}
          </div>
          <div>
            <button
              type="button"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={15} aria-hidden />
              {activeLogoUrl ? "Replace" : "Upload"}
            </button>
            {logoUrl || draftFile ? (
              <button
                type="button"
                className="danger"
                disabled={saving}
                onClick={() => {
                  setDraftFile(null);
                  setRemoveLogo(Boolean(logoUrl));
                  setPlacement(defaultPlacement());
                  setLocalError(null);
                }}
              >
                <Trash2 size={15} aria-hidden />
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <div className="schedule-logo-controls">
          <LogoRange
            label="Scale"
            icon={<ZoomIn size={15} aria-hidden />}
            min={0.25}
            max={4}
            step={0.05}
            value={placement.scale}
            valueLabel={`${placement.scale.toFixed(2)}x`}
            disabled={saving || !activeLogoUrl}
            onChange={(scale) => updatePlacement({ scale })}
          />
          <LogoRange
            label="Horizontal"
            icon={<MoveHorizontal size={15} aria-hidden />}
            min={-100}
            max={100}
            step={1}
            value={placement.offset_x}
            valueLabel={`${Math.round(placement.offset_x)}%`}
            disabled={saving || !activeLogoUrl}
            onChange={(offset_x) => updatePlacement({ offset_x })}
          />
          <LogoRange
            label="Vertical"
            icon={<MoveVertical size={15} aria-hidden />}
            min={-100}
            max={100}
            step={1}
            value={placement.offset_y}
            valueLabel={`${Math.round(placement.offset_y)}%`}
            disabled={saving || !activeLogoUrl}
            onChange={(offset_y) => updatePlacement({ offset_y })}
          />
          <button
            type="button"
            disabled={saving || !activeLogoUrl}
            onClick={() => setPlacement(defaultPlacement())}
          >
            <RotateCcw size={15} aria-hidden />
            Reset
          </button>
        </div>

        {shownError ? (
          <p className="form-error" role="alert">
            {shownError}
          </p>
        ) : null}

        <footer>
          <button
            type="button"
            className="primary"
            disabled={!canSave}
            onClick={() => onSave({ file: draftFile, removeLogo, placement })}
          >
            <Save size={15} aria-hidden />
            {saving ? "Saving" : "Save"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function LogoRange({
  label,
  icon,
  min,
  max,
  step,
  value,
  valueLabel,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly icon: ReactNode;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly valueLabel: string;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>
        <span>
          {icon}
          {label}
        </span>
        <strong>{valueLabel}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function validateLogoFile(file: File): string | null {
  if (!(organizationLogoMimeTypes as readonly string[]).includes(file.type)) {
    return "Use an SVG, PNG, JPEG, or WebP image.";
  }
  if (file.size <= 0) return "The selected image is empty.";
  if (file.size > organizationLogoMaxBytes)
    return "Logo must be 5 MB or smaller.";
  return null;
}

function formatLogoUpdatedAt(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Updated ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
