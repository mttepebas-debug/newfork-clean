import { LineupDialog as Dialog } from "./LineupDialog";
import type {
  ScheduleLineupBrief,
  ScheduleLineupReadModel,
  ScheduleLineupSharePreview,
} from "@newfork/shared";
import { Copy, FileDown, ImageDown, Send, Share2 } from "lucide-react";
import { useRef, useState, type Ref } from "react";
import {
  copyLineupPng,
  downloadLineupPdf,
  downloadLineupPng,
  formatLineupShareDate,
  formatLineupSharedAt,
  shareLineupPng,
} from "../lineup-share";
import { formatLineupInterval } from "./lineup-time";
import { LineupSaveStatus, useLineupAutosave } from "./useLineupAutosave";

type BriefValue = Pick<
  ScheduleLineupBrief,
  "out_of_stock" | "specials" | "pre_shift_notes"
>;
export function BriefDialog({
  typeName,
  brief,
  onClose,
  onSave,
}: {
  typeName: string;
  brief: ScheduleLineupBrief | undefined;
  onClose: () => void;
  onSave: (
    value: BriefValue,
    revision: number | null,
  ) => Promise<number | null>;
}) {
  const [value, setValue] = useState<BriefValue>({
    out_of_stock: brief?.out_of_stock ?? "",
    specials: brief?.specials ?? "",
    pre_shift_notes: brief?.pre_shift_notes ?? "",
  });
  const revision = useRef(brief?.revision ?? null);
  const autosave = useLineupAutosave({
    value,
    save: async (draft) => {
      revision.current = await onSave(draft, revision.current);
    },
  });
  const close = async () => {
    if (await autosave.flush()) onClose();
  };
  return (
    <Dialog title={`${typeName} brief`} onClose={() => void close()}>
      <label>
        86 / out of stock
        <textarea
          maxLength={1000}
          value={value.out_of_stock}
          onChange={(e) => setValue({ ...value, out_of_stock: e.target.value })}
        />
      </label>
      <label>
        Specials
        <textarea
          maxLength={1000}
          value={value.specials}
          onChange={(e) => setValue({ ...value, specials: e.target.value })}
        />
      </label>
      <label>
        Pre-shift notes
        <textarea
          maxLength={2000}
          value={value.pre_shift_notes}
          onChange={(e) =>
            setValue({ ...value, pre_shift_notes: e.target.value })
          }
        />
      </label>
      <LineupSaveStatus state={autosave} onDiscard={onClose} />
      <button
        className="nf-button"
        disabled={autosave.saving}
        onClick={() => void close()}
      >
        Done
      </button>
    </Dialog>
  );
}
export function ShareDialog({
  preview,
  model,
  shareText,
  onClose,
  onConfirm,
  published = false,
}: {
  preview: ScheduleLineupSharePreview;
  model: ScheduleLineupReadModel;
  shareText: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  published?: boolean;
}) {
  const visualRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileBase =
    `lineup-${model.date}-${preview.locations.length === 1 ? preview.locations[0]!.location_name : `${preview.locations.length}-locations`}`
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-|-$)/g, "") || "lineup";
  async function copyShareText() {
    try {
      setStatus("");
      if (!navigator.clipboard?.writeText) {
        throw new Error("Text clipboard is not supported in this browser.");
      }
      await navigator.clipboard.writeText(shareText);
      setStatus("Share text copied.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Share text could not be copied.",
      );
    }
  }
  async function runImageExport(
    kind: "copy" | "png" | "pdf" | "share",
  ): Promise<void> {
    try {
      setStatus("");
      if (!visualRef.current) throw new Error("Line-up image is not ready.");
      if (kind === "copy") {
        await copyLineupPng(visualRef.current);
        setStatus("Line-up image copied.");
        return;
      }
      if (kind === "png") {
        await downloadLineupPng(visualRef.current, `${fileBase}.png`);
        setStatus("PNG exported.");
        return;
      }
      if (kind === "pdf") {
        await downloadLineupPdf(visualRef.current, `${fileBase}.pdf`);
        setStatus("PDF exported.");
        return;
      }
      const nativeShared = await shareLineupPng(
        visualRef.current,
        `${fileBase}.png`,
        shareText,
      );
      setStatus(nativeShared ? "Line-up image shared." : "Image downloaded.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Line-up image export failed.",
      );
    }
  }
  return (
    <Dialog
      title={published ? "Shared Line Up" : "Share Line-up"}
      onClose={onClose}
    >
      <p className="lineup-share-summary">
        {published
          ? "Export the exact version your team received."
          : "Review the assignments and notes before sharing. Unselected services keep their previous shared content."}
      </p>
      {preview.locations.map((l) => (
        <div className="lineup-share-row" key={l.location_id}>
          <strong>{l.location_name}</strong>
          <span>{l.entry_count} rows</span>
          <small>
            +{l.added} · ~{l.updated} · -{l.removed}
          </small>
        </div>
      ))}
      <div
        className="lineup-share-visual-actions"
        aria-label="Line-up image actions"
      >
        <button
          className="icon-button"
          type="button"
          aria-label="Copy Line-up image"
          title="Copy Line-up image"
          onClick={() => void runImageExport("copy")}
        >
          <Copy size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Share Line-up image"
          title="Share Line-up image"
          onClick={() => void runImageExport("share")}
        >
          <Share2 size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Download Line-up PNG"
          title="Download Line-up PNG"
          onClick={() => void runImageExport("png")}
        >
          <ImageDown size={16} />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Download Line-up PDF"
          title="Download Line-up PDF"
          onClick={() => void runImageExport("pdf")}
        >
          <FileDown size={16} />
        </button>
      </div>
      <LineupVisualPreview
        model={model}
        ref={visualRef}
        published={published}
      />
      <label className="lineup-share-text">
        Share text
        <textarea readOnly value={shareText} />
      </label>
      <button
        className="nf-button secondary"
        type="button"
        onClick={() => void copyShareText()}
      >
        <Copy size={16} /> Copy share text
      </button>
      {status ? (
        <p className="lineup-section-message" role="status">
          {status}
        </p>
      ) : null}
      {!published ? (
        <button
          className="nf-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setStatus("");
            void onConfirm()
              .catch((err) =>
                setStatus(err instanceof Error ? err.message : "Share failed"),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Send size={16} /> Create share version
        </button>
      ) : null}
    </Dialog>
  );
}

function LineupVisualPreview({
  model,
  ref,
  published,
}: {
  published: boolean;
  model: ScheduleLineupReadModel;
  ref: Ref<HTMLDivElement>;
}) {
  return (
    <div className="lineup-visual-preview" ref={ref}>
      {model.locations.map((location) => (
        <section key={location.id}>
          <header>
            <div>
              <strong>{location.name}</strong>
              <span>{formatLineupShareDate(model.date)}</span>
              {published && location.shared_at ? (
                <span>
                  Shared{" "}
                  {formatLineupSharedAt(
                    location.shared_at,
                    location.timezone,
                    model.settings.time_format,
                  )}
                </span>
              ) : null}
            </div>
            <small>
              {published
                ? `SHARED · v${location.share_version}`
                : `DRAFT · next v${location.share_version + 1}`}
            </small>
          </header>
          {location.notes?.map((note) => (
            <div className="lu-note" key={note.id}>
              <strong>{note.category}</strong>
              <p>{note.content}</p>
              {note.expires_at ? (
                <small>Valid until {note.expires_at}</small>
              ) : null}
            </div>
          ))}
          {model.shift_types.map((shiftType) => {
            const entries = location.entries
              .filter(
                (entry) =>
                  entry.shift_type_id === shiftType.id &&
                  !entry.call_off &&
                  !entry.hidden,
              )
              .sort(
                (left, right) =>
                  left.display_order - right.display_order ||
                  (left.start_time ?? "").localeCompare(right.start_time ?? ""),
              );
            const brief = location.briefs.find(
              (item) => item.shift_type_id === shiftType.id,
            );
            if (!entries.length && !brief) return null;
            return (
              <div className="lineup-visual-service" key={shiftType.id}>
                <h3>
                  <i style={{ backgroundColor: shiftType.color }} />
                  {shiftType.name}
                </h3>
                {brief ? (
                  <dl>
                    {brief.out_of_stock.trim() ? (
                      <div>
                        <dt>86</dt>
                        <dd>{brief.out_of_stock}</dd>
                      </div>
                    ) : null}
                    {brief.specials.trim() ? (
                      <div>
                        <dt>Specials</dt>
                        <dd>{brief.specials}</dd>
                      </div>
                    ) : null}
                    {brief.pre_shift_notes.trim() ? (
                      <div>
                        <dt>Pre-shift</dt>
                        <dd>{brief.pre_shift_notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                <div className="lineup-visual-table">
                  {entries.map((entry) => (
                    <div key={entry.id}>
                      <span>
                        {entry.start_time && entry.end_time
                          ? formatLineupInterval(
                              entry,
                              model.settings.time_format,
                              model.date,
                              location.timezone,
                            )
                          : ""}
                      </span>
                      <strong>{entry.employee_name || "Open position"}</strong>
                      <span>{entry.job_name}</span>
                      <span>
                        {[entry.section_name, entry.station]
                          .map((part) => part.trim())
                          .filter(Boolean)
                          .join(" - ")}
                        {entry.note ? (
                          <small className="lu-export-note">{entry.note}</small>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

export { SectionsDialog } from "./LineupSections";
