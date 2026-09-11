import { LineupCandidateList } from "./LineupCandidates";
import { useToast } from "@newfork/ui";
import { getLineupDestinations, submitLineupProposal } from "../lineup-data";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { loadSchedulingSettings } from "../../settings/organization-data";
import {
  ArrowRight,
  ArrowRightLeft,
  Clock3,
  Search,
  AlertCircle,
} from "lucide-react";
import type {
  LineupCandidate,
  LineupOperation,
  LineupOperationPreview,
  LineupTarget,
  ScheduleLineupEntry,
  ScheduleLineupEntryMutationResult,
  ScheduleLineupLocation,
  ScheduleLineupReadModel,
} from "@newfork/shared";
import {
  applyLineupOperation,
  getLineupCandidates,
  getLineup,
  previewLineupOperation,
  saveLineupEntry,
  deleteLineupEntry,
} from "../lineup-data";
import { LineupDialog } from "./LineupDialog";
import { entryInput, lineupSectionAllowed } from "./lineup-helpers";
import { LineupSaveStatus, useLineupAutosave } from "./useLineupAutosave";

export function LineupEditor({
  row,
  placement,
  sectionId,
  mode,
  workspaceId,
  date,
  location,
  model,
  serviceId,
  onClose,
  onSaved,
}: {
  row: ScheduleLineupEntry | null;
  placement?: Pick<
    ScheduleLineupEntry,
    "start_time" | "end_time" | "section_id" | "station"
  >;
  sectionId: string | null;
  mode: "edit" | "extra" | "assign" | "replace";
  workspaceId: string;
  date: string;
  location: ScheduleLineupLocation;
  model: ScheduleLineupReadModel;
  serviceId: string | null;
  onClose: () => void;
  onSaved: (
    result?: ScheduleLineupEntryMutationResult,
    keepOpen?: boolean,
  ) => Promise<void>;
}) {
  const navigate = useNavigate();
  const type = model.shift_types.find(
    (item) => item.id === (row?.shift_type_id ?? serviceId),
  );
  const [target, setTarget] = useState<LineupTarget>({
    date,
    location_id: location.id,
    section_id: sectionId,
    job_id: row?.job_id ?? "",
    shift_type_id: row?.shift_type_id ?? serviceId ?? "",
    start_time: row?.start_time ?? type?.default_start_time ?? "",
    end_time: row?.end_time ?? type?.default_end_time ?? "",
    station: placement?.station ?? row?.station ?? "",
  });
  const [intent, setIntent] = useState<
    "section" | "extra" | "assign" | "replace" | "move" | "swap" | "release"
  >(mode === "edit" ? "section" : mode);
  const travelPolicy = useQuery({
    queryKey: ["scheduling-settings", workspaceId],
    queryFn: () => loadSchedulingSettings(workspaceId),
    enabled: intent !== "section" && intent !== "extra" && intent !== "release",
  });
  const [employee, setEmployee] = useState<string | null>(null);
  const [movingCandidate, setMovingCandidate] =
    useState<LineupCandidate | null>(null);
  const [requestSwap, setRequestSwap] = useState(false);
  const [swapEntry, setSwapEntry] = useState<string | null>(null);
  const [counterpartDate, setCounterpartDate] = useState(date);
  const [term, setTerm] = useState("");
  const [reason, setReason] = useState("");
  const [assignmentNote, setAssignmentNote] = useState(row?.note ?? "");
  const [partialPlacement, setPartialPlacement] = useState(Boolean(placement));
  const [placementStart, setPlacementStart] = useState(
    placement?.start_time ?? row?.start_time ?? "",
  );
  const [placementEnd, setPlacementEnd] = useState(
    placement?.end_time ?? row?.end_time ?? "",
  );
  const [travel, setTravel] = useState(0);
  const [preview, setPreview] = useState<LineupOperationPreview | null>(null);
  const toast = useToast();
  const reviewedContext = useRef<string | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const hadPreview = useRef(false);
  useEffect(() => {
    if (
      preview &&
      (document.activeElement === document.body ||
        document.activeElement === reviewButton.current)
    ) {
      previewHeading.current?.focus({ preventScroll: true });
      previewHeading.current?.scrollIntoView?.({ block: "start" });
    } else if (
      !preview &&
      hadPreview.current &&
      (document.activeElement === document.body ||
        document.activeElement === reviewButton.current ||
        previewHeading.current
          ?.closest(".lu-impact")
          ?.contains(document.activeElement))
    )
      reviewButton.current?.focus();
    hadPreview.current = Boolean(preview);
  }, [preview]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const identity = useRef({
    id: row?.overlay_id ?? null,
    revision: row?.revision ?? null,
  });
  const liveRow =
    model.locations
      .find((item) => item.id === location.id)
      ?.entries.find(
        (entry) =>
          entry.id === row?.id ||
          Boolean(
            row?.source_shift_id &&
            entry.source_shift_id === row.source_shift_id,
          ),
      ) ?? row;
  const currentRow = useRef(liveRow);
  currentRow.current = liveRow;
  const autosave = useLineupAutosave({
    value: {
      section_id: target.section_id,
      station: target.station,
      note: assignmentNote,
      partialPlacement,
      placementStart,
      placementEnd,
    },
    enabled: intent === "section" && Boolean(row && !row.orphaned),
    validate: (draft) =>
      draft.partialPlacement &&
      (!draft.placementStart ||
        !draft.placementEnd ||
        draft.placementStart === draft.placementEnd)
        ? "Choose a valid placement interval."
        : "",
    save: async (draft) => {
      if (!liveRow) return;
      const saved = await saveLineupEntry(
        workspaceId,
        location.id,
        date,
        {
          ...entryInput(liveRow),
          section_id: draft.section_id,
          station: draft.station,
          note: draft.note,
          placement_segments: draft.partialPlacement ? undefined : [],
          placement_range: draft.partialPlacement
            ? { start_time: draft.placementStart, end_time: draft.placementEnd }
            : undefined,
        },
        identity.current.id,
        identity.current.revision,
      );
      identity.current = { id: saved.entry_id, revision: saved.entry_revision };
      await onSaved(saved, true);
    },
  });
  const close = async () => {
    if (await autosave.flush()) onClose();
  };
  const placementSources = (() => {
    if (!row || intent !== "section") return [];
    if (!row.placement_segments?.length)
      return row.section_id && row.section_id !== target.section_id
        ? [row.section_name]
        : [];
    const minutes = (clock: string) => {
      const [h, m] = clock.split(":").map(Number);
      return h! * 60 + m!;
    };
    const anchor = minutes(row.start_time ?? "00:00");
    const relative = (clock: string) => {
      const value = minutes(clock);
      return value < anchor ? value + 1440 : value;
    };
    const starts = partialPlacement ? relative(placementStart) : -Infinity;
    let ends = partialPlacement ? relative(placementEnd) : Infinity;
    if (ends <= starts) ends += 1440;
    const clock = (instant: string) =>
      new Date(instant).toLocaleTimeString("en-GB", {
        timeZone: location.timezone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      });
    return [
      ...new Set(
        row.placement_segments
          .filter((segment) => {
            let end = relative(clock(segment.end_at));
            const start = relative(clock(segment.start_at));
            if (end <= start) end += 1440;
            return (
              segment.section_id &&
              segment.section_id !== target.section_id &&
              start < ends &&
              starts < end
            );
          })
          .map((segment) => segment.section_name || "Previous section"),
      ),
    ];
  })();
  const operational = ["assign", "replace", "move", "swap", "release"].includes(
    intent,
  );
  const complete = Boolean(
    target.job_id &&
    target.shift_type_id &&
    target.start_time &&
    target.end_time &&
    target.start_time !== target.end_time,
  );
  const destinations = useQuery({
    queryKey: ["lineup-destinations", workspaceId],
    queryFn: () => getLineupDestinations(workspaceId),
    enabled: intent === "move" || intent === "swap",
  });
  const lookupDate =
    intent === "swap" && !requestSwap ? counterpartDate : target.date;
  const adjacentDay = useQuery({
    queryKey: ["lineup", workspaceId, lookupDate],
    queryFn: () => getLineup(workspaceId, lookupDate),
    enabled: lookupDate !== date && (intent === "move" || intent === "swap"),
    retry: false,
  });
  const destinationModel = lookupDate === date ? model : adjacentDay.data;
  const targetTimezone =
    (destinations.data ?? model.locations).find(
      (item) => item.id === target.location_id,
    )?.timezone ?? location.timezone;
  const candidates = useQuery({
    queryKey: ["lineup-candidates", workspaceId, target, liveRow?.id],
    queryFn: () =>
      getLineupCandidates(workspaceId, target, liveRow?.id ?? null),
    enabled: complete && (intent === "assign" || intent === "replace"),
    retry: false,
  });
  const operation: LineupOperation = {
    kind: movingCandidate
      ? "move"
      : operational
        ? (intent as LineupOperation["kind"])
        : "assign",
    source_entry_id:
      movingCandidate?.move_source?.entry_id ?? liveRow?.id ?? null,
    target_entry_id: movingCandidate
      ? (liveRow?.id ?? null)
      : requestSwap
        ? null
        : swapEntry,
    replace_target: Boolean(
      movingCandidate && row?.employee_id && !row.call_off,
    ),
    employee_id: intent === "move" ? (row?.employee_id ?? null) : employee,
    target,
    reason,
    travel_minutes: travel,
  };
  // Bind review to the observed source and selected people, not object identity
  // or fetch timestamps. A quiet refresh with identical data retains the review.
  const reviewContext = JSON.stringify({
    operation,
    minimumTravelMinutes: travelPolicy.data?.minimum_travel_minutes,
    source: liveRow,
    sourceExists:
      !row ||
      model.locations.some((item) =>
        item.entries.some(
          (entry) =>
            entry.id === row.id ||
            Boolean(
              row.source_shift_id &&
              entry.source_shift_id === row.source_shift_id,
            ),
        ),
      ),
    candidate:
      candidates.data?.find((item) => item.employee_id === employee) ?? null,
    candidateError: candidates.isError,
    counterpart:
      destinationModel?.locations
        .flatMap((item) => item.entries)
        .find((entry) => entry.id === swapEntry) ?? null,
    destinationError: adjacentDay.isError,
  });
  const currentReviewContext = useRef(reviewContext);
  currentReviewContext.current = reviewContext;
  const previewIsCurrent = Boolean(
    preview && reviewedContext.current === reviewContext,
  );
  const staffingReadUnavailable =
    ((intent === "assign" || intent === "replace") &&
      (candidates.isFetching || candidates.isError)) ||
    ((intent === "move" || intent === "swap") &&
      lookupDate !== date &&
      (adjacentDay.isFetching || adjacentDay.isError));
  useEffect(() => {
    if (preview && reviewedContext.current !== reviewContext) {
      setPreview(null);
      setError(
        "Staffing details changed. Review the impact again. Your choices have been kept.",
      );
    }
  }, [preview, reviewContext]);
  function change(patch: Partial<LineupTarget>) {
    setTarget((value) => ({ ...value, ...patch }));
    if (
      Object.keys(patch).some(
        (key) => key !== "start_time" && key !== "end_time",
      )
    ) {
      setEmployee(null);
      setMovingCandidate(null);
    }
    setPreview(null);
    setKey(crypto.randomUUID());
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes("stale Line Up operation preview") ||
          err.message.includes(
            "Review the current availability conflict before assigning",
          ))
      )
        setPreview(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not save. Your choices have been kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  const title =
    intent === "section"
      ? "Assignment details"
      : intent === "release"
        ? "Remove assignment · keep need open"
        : intent === "extra"
          ? "Add an extra line"
          : intent === "replace"
            ? "Find replacement"
            : intent === "move"
              ? "Move to another location"
              : intent === "swap"
                ? "Swap across locations"
                : "Add staff";
  const swapChoices = (destinationModel?.locations ?? [])
    .filter((item) => item.id !== location.id)
    .flatMap((item) =>
      item.entries
        .filter(
          (entry) =>
            entry.employee_id &&
            !entry.hidden &&
            !entry.call_off &&
            !entry.orphaned,
        )
        .map((entry) => ({ ...entry, locationName: item.name })),
    );
  return (
    <LineupDialog title={title} onClose={() => void close()}>
      <div className="lu-editor-context">
        <span className="lu-avatar">
          {row?.employee_name ? (
            row.employee_name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
          ) : (
            <Clock3 size={19} />
          )}
        </span>
        <div>
          <strong>{row?.employee_name || "New coverage need"}</strong>
          <span>
            {location.name} · {date}
            {row?.job_name ? ` · ${row.job_name}` : ""}
          </span>
        </div>
      </div>
      {row ? (
        <div className="lu-editor-intents" aria-label="Assignment action">
          {(["section", "replace", "move", "swap"] as const)
            .filter(
              (value) =>
                Boolean(row.employee_id) ||
                value === "section" ||
                value === "replace",
            )
            .map((value) => (
              <button
                key={value}
                aria-pressed={intent === value}
                disabled={busy || autosave.saving}
                onClick={async () => {
                  if (!(await autosave.flush())) return;
                  setIntent(value);
                  setSwapEntry(null);
                  setRequestSwap(false);
                  setCounterpartDate(date);
                  change({
                    date,
                    location_id: location.id,
                    job_id: row.job_id ?? "",
                    shift_type_id: row.shift_type_id ?? "",
                    section_id: currentRow.current?.section_id ?? null,
                    station: currentRow.current?.station ?? "",
                    start_time: row.start_time ?? "",
                    end_time: row.end_time ?? "",
                  });
                }}
              >
                {value === "section"
                  ? "Section & station"
                  : value === "replace"
                    ? "Replacement"
                    : value === "move"
                      ? "Move location"
                      : "Swap"}
              </button>
            ))}
        </div>
      ) : null}
      {liveRow?.source_changed ? (
        <p className="lu-error">
          Schedule was republished with a changed person, position or time.
          Review the updated assignment and save its section/station before
          changing staffing or sharing.
        </p>
      ) : null}
      {row?.orphaned ? (
        <div className="lu-error">
          <AlertCircle size={16} />
          <span>
            The source shift changed. Reconcile this assignment in Schedule
            before changing staffing.
            {row.overlay_id && row.revision ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deleteLineupEntry(
                      workspaceId,
                      row.overlay_id!,
                      row.revision!,
                    );
                    await onSaved();
                  })
                }
              >
                Dismiss obsolete placement
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (intent === "section" && row) {
            void autosave
              .flush(Boolean(liveRow?.source_changed))
              .then((saved) => {
                if (saved) onClose();
              });
            return;
          }
          void run(async () => {
            if (intent === "extra") {
              await saveLineupEntry(
                workspaceId,
                location.id,
                date,
                {
                  ...target,
                  note: assignmentNote,
                  source_shift_id: null,
                  employee_id: null,
                  call_off: false,
                  hidden: false,
                  display_order: location.entries.length,
                },
                null,
                null,
              );
              await onSaved();
              return;
            }
            if (staffingReadUnavailable) {
              throw new Error(
                "Wait for current staffing details before reviewing or confirming this change.",
              );
            }
            if (!preview || !previewIsCurrent) {
              const contextAtRequest = currentReviewContext.current;
              const result = await previewLineupOperation(
                workspaceId,
                operation,
              );
              if (contextAtRequest !== currentReviewContext.current) {
                throw new Error(
                  "Staffing details changed during review. Review the impact again. Your choices have been kept.",
                );
              }
              reviewedContext.current = contextAtRequest;
              setPreview(result);
              return;
            }
            if (preview.requires_approval) {
              await submitLineupProposal(
                workspaceId,
                "transfer",
                operation,
                preview.fingerprint,
                key,
              );
              await onSaved();
              return;
            }
            if (preview.availability_warning?.policy === "confirm") {
              await applyLineupOperation(
                workspaceId,
                operation,
                preview.fingerprint,
                key,
                true,
              );
            } else {
              await applyLineupOperation(
                workspaceId,
                operation,
                preview.fingerprint,
                key,
              );
            }
            if (preview.availability_warning?.policy === "warn") {
              toast.warning("Availability conflict saved", {
                dedupeKey: "lineup-editor-availability-warning",
                description: "This assignment overlaps unavailable hours.",
              });
            }
            await onSaved();
          });
        }}
      >
        <fieldset
          disabled={busy || Boolean(preview)}
          className="lu-editor-fields"
        >
          {intent === "section" && row?.start_time && row.end_time ? (
            <div className="lu-placement-range">
              <label className="lu-checkbox">
                <input
                  type="checkbox"
                  checked={partialPlacement}
                  onChange={(event) =>
                    setPartialPlacement(event.target.checked)
                  }
                />
                Change section for part of this shift
              </label>
              {partialPlacement ? (
                <div className="lu-form-grid">
                  <label>
                    Placement starts
                    <input
                      type="time"
                      required
                      value={placementStart}
                      onChange={(event) =>
                        setPlacementStart(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Placement ends
                    <input
                      type="time"
                      required
                      value={placementEnd}
                      onChange={(event) => setPlacementEnd(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              <p className="lu-field-help">
                {partialPlacement
                  ? `Only this interval moves. Earlier and later placement stays in place. Times use ${location.timezone}; after-midnight times belong to the overnight shift.`
                  : "Applies to the whole shift. Choose a partial interval if service has already started."}
              </p>
              {row.placement_segments?.length ? (
                <ul className="lu-placement-summary">
                  {row.placement_segments.map((segment) => (
                    <li key={segment.id}>
                      {new Date(segment.start_at).toLocaleTimeString([], {
                        timeZone: location.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      –
                      {new Date(segment.end_at).toLocaleTimeString([], {
                        timeZone: location.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {segment.section_name || "Unassigned"}
                      {segment.station ? ` · ${segment.station}` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {intent === "move" || (intent === "swap" && requestSwap) ? (
            <label>
              Destination location
              <select
                required
                value={target.location_id}
                onChange={(event) => {
                  setSwapEntry(null);
                  change({ location_id: event.target.value, section_id: null });
                }}
              >
                {(destinations.data ?? model.locations).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {intent === "move" && target.location_id !== location.id ? (
            <label>
              Fill an existing open need
              <select
                value={swapEntry ?? ""}
                onChange={(event) => {
                  const choice = destinationModel?.locations
                    .find((item) => item.id === target.location_id)
                    ?.entries.find((entry) => entry.id === event.target.value);
                  setSwapEntry(event.target.value || null);
                  if (choice)
                    change({
                      job_id: choice.job_id ?? "",
                      shift_type_id: choice.shift_type_id ?? "",
                      section_id: choice.section_id,
                      station: choice.station ?? "",
                    });
                  else setPreview(null);
                }}
              >
                <option value="">Create coverage at destination</option>
                {destinationModel?.locations
                  .find((item) => item.id === target.location_id)
                  ?.entries.filter(
                    (entry) =>
                      (!entry.employee_id || entry.call_off) &&
                      !entry.hidden &&
                      !entry.orphaned &&
                      !entry.source_changed,
                  )
                  .map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.job_name} · {entry.start_time}–{entry.end_time} ·{" "}
                      {entry.section_name || "Unassigned"}
                    </option>
                  ))}
              </select>
            </label>
          ) : null}
          {operational ? (
            <label>
              Assignment date · {targetTimezone}
              <input
                type="date"
                required
                value={target.date}
                onChange={(event) => {
                  setSwapEntry(null);
                  change({ date: event.target.value });
                }}
              />
            </label>
          ) : null}
          {adjacentDay.isError && lookupDate !== date ? (
            <p className="lu-error" role="alert">
              Could not load the selected day's assignments.{" "}
              {adjacentDay.error.message}
            </p>
          ) : null}
          {intent !== "section" ? (
            <div className="lu-form-grid">
              <label>
                Service
                <select
                  required
                  disabled={intent === "release"}
                  value={target.shift_type_id}
                  onChange={(event) => {
                    const service = model.shift_types.find(
                      (item) => item.id === event.target.value,
                    );
                    change({
                      shift_type_id: event.target.value,
                      start_time:
                        target.start_time || service?.default_start_time || "",
                      end_time:
                        target.end_time || service?.default_end_time || "",
                    });
                  }}
                >
                  <option value="">Choose service</option>
                  {model.shift_types.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Position
                <select
                  required
                  disabled={intent === "release"}
                  value={target.job_id}
                  onChange={(event) => change({ job_id: event.target.value })}
                >
                  <option value="">Choose position</option>
                  {model.jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <div className="lu-form-grid">
            <label>
              Section
              <select
                disabled={intent === "release"}
                value={target.section_id ?? ""}
                onChange={(event) =>
                  change({ section_id: event.target.value || null })
                }
              >
                <option value="">Unassigned</option>
                {model.sections.map((section) => (
                  <option
                    key={section.id}
                    value={section.id}
                    disabled={
                      !lineupSectionAllowed(
                        section,
                        target.location_id,
                        target.shift_type_id,
                        target.job_id,
                      )
                    }
                  >
                    {section.name}
                    {!lineupSectionAllowed(
                      section,
                      target.location_id,
                      target.shift_type_id,
                      target.job_id,
                    )
                      ? " · Not available for this assignment"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Station / tables
              <input
                disabled={intent === "release"}
                maxLength={80}
                placeholder="e.g. Tables 21–26"
                value={target.station}
                onChange={(event) => change({ station: event.target.value })}
              />
            </label>
          </div>
          {intent === "extra" || intent === "section" ? (
            <label>
              Assignment note (optional)
              <textarea
                aria-label="Assignment note (optional)"
                maxLength={500}
                rows={2}
                value={assignmentNote}
                placeholder="Details the assigned team should know"
                onChange={(event) => setAssignmentNote(event.target.value)}
              />
              <span className="lu-field-help">
                Included when you share this assignment with the team.
              </span>
            </label>
          ) : null}
          {placementSources.length ? (
            <p className="lu-review-banner">
              {placementSources.join(", ")} will no longer have this assignment
              for{" "}
              {partialPlacement
                ? `${placementStart}–${placementEnd}`
                : `${row?.start_time}–${row?.end_time}`}
              . Review source coverage before saving. Schedule working time
              stays unchanged.
            </p>
          ) : null}
          {intent !== "section" ? (
            <div className="lu-form-grid">
              <label>
                Starts
                <input
                  required
                  type="time"
                  value={target.start_time}
                  onChange={(event) =>
                    change({ start_time: event.target.value })
                  }
                />
              </label>
              <label>
                Ends
                <input
                  required
                  type="time"
                  value={target.end_time}
                  onChange={(event) => change({ end_time: event.target.value })}
                />
              </label>
            </div>
          ) : null}
          {target.start_time &&
          target.end_time &&
          target.end_time < target.start_time ? (
            <p className="lu-field-help">
              Ends the following day. Availability is checked across midnight.
            </p>
          ) : null}
          {intent === "move" || intent === "swap" || movingCandidate ? (
            <>
              <p className="lu-field-help">
                Choose the full shift or a shorter interval. The unchanged time
                stays with the original assignment.
              </p>
              <label>
                Requested travel time (minutes)
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={travel}
                  onChange={(event) => {
                    setTravel(Number(event.target.value));
                    setPreview(null);
                  }}
                />
              </label>
            </>
          ) : null}
          {intent !== "section" &&
          intent !== "extra" &&
          intent !== "release" ? (
            <p className="lu-field-help" role="status">
              {travelPolicy.data
                ? (travelPolicy.data.minimum_travel_minutes ?? 0) > 0
                  ? `Company minimum: ${travelPolicy.data.minimum_travel_minutes} minutes between locations. At least ${Math.max(travelPolicy.data.minimum_travel_minutes ?? 0, travel)} minutes will be checked.`
                  : "No company travel minimum configured. Any requested travel time still applies."
                : "The current company travel minimum will be checked in the review."}
            </p>
          ) : null}
          {intent === "swap" ? (
            <label className="lu-checkbox">
              <input
                type="checkbox"
                checked={requestSwap}
                onChange={(event) => {
                  setRequestSwap(event.target.checked);
                  setSwapEntry(null);
                  change({
                    date,
                    location_id: location.id,
                    section_id: row?.section_id ?? null,
                  });
                }}
              />
              Request a counterpart from the destination manager
            </label>
          ) : null}
          {intent === "swap" && !requestSwap ? (
            <label>
              Counterpart's local date
              <input
                type="date"
                required
                value={counterpartDate}
                onChange={(event) => {
                  setCounterpartDate(event.target.value);
                  setSwapEntry(null);
                  setPreview(null);
                }}
              />
            </label>
          ) : null}
          {intent === "swap" && !requestSwap ? (
            <label>
              Exchange assignments with
              <select
                required
                value={swapEntry ?? ""}
                onChange={(event) => {
                  setSwapEntry(event.target.value || null);
                  setPreview(null);
                }}
              >
                <option value="">Choose a colleague at another location</option>
                {swapChoices.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.employee_name} · {entry.locationName} ·{" "}
                    {entry.job_name} · {entry.start_time}–{entry.end_time}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {intent === "assign" || intent === "replace" ? (
            <section className="lu-candidates">
              <header>
                <h3>Available staff</h3>
                <span>Checked for this assignment</span>
              </header>
              <label className="lu-search">
                <Search size={15} />
                <input
                  aria-label="Search candidates"
                  placeholder="Search by name"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                />
              </label>
              {!complete ? (
                <p className="lu-empty-small">
                  Choose a service, position and time to check availability.
                </p>
              ) : candidates.isPending ? (
                <p role="status">Checking availability…</p>
              ) : candidates.error ? (
                <p className="lu-error" role="alert">
                  {candidates.error.message}
                </p>
              ) : (
                <LineupCandidateList
                  candidates={(candidates.data ?? []).filter((item) =>
                    item.display_name
                      .toLowerCase()
                      .includes(term.toLowerCase()),
                  )}
                  selectedEmployeeId={employee}
                  onSelect={(candidate) => {
                    setMovingCandidate(
                      candidate.status === "movable" ? candidate : null,
                    );
                    setEmployee(candidate.employee_id);
                    setPreview(null);
                    setKey(crypto.randomUUID());
                  }}
                />
              )}
            </section>
          ) : null}
          {operational ? (
            <label>
              Reason for change
              <textarea
                required
                maxLength={500}
                value={reason}
                placeholder="Add context for the affected team"
                onChange={(event) => {
                  setReason(event.target.value);
                  setPreview(null);
                }}
              />
            </label>
          ) : null}
        </fieldset>
        {intent === "extra" ? (
          <p className="lu-field-help">
            This creates an open position. Choose “Find available staff” on the
            card to fill it.
          </p>
        ) : null}
        {preview ? (
          <div className="lu-impact">
            <h3 ref={previewHeading} tabIndex={-1}>
              <ArrowRightLeft size={17} /> Review the change
            </h3>
            {intent !== "release" &&
            preview.effective_travel_minutes !== undefined ? (
              <p className="lu-field-help">
                Travel between locations: {preview.effective_travel_minutes}{" "}
                minutes. Company minimum: {preview.minimum_travel_minutes ?? 0}{" "}
                minutes.
              </p>
            ) : null}
            {preview.availability_warning && (
              <p className="lu-badge warning">Availability conflict</p>
            )}
            {preview.effects.map((effect, index) => (
              <p key={index}>{effect}</p>
            ))}
            {preview.blockers.map((blocker, index) => (
              <p className="lu-error" key={index}>
                {blocker}
              </p>
            ))}
            <button type="button" onClick={() => setPreview(null)}>
              Edit choices
            </button>
          </div>
        ) : null}
        {error ? (
          <div className="lu-error" role="alert">
            {error}
          </div>
        ) : null}
        {previewIsCurrent &&
        preview?.allowed &&
        !preview.requires_approval &&
        !movingCandidate &&
        row &&
        (intent === "assign" || intent === "replace") ? (
          <button
            type="button"
            className="nf-button secondary"
            disabled={busy || staffingReadUnavailable}
            onClick={() =>
              void run(async () => {
                await submitLineupProposal(
                  workspaceId,
                  "offer",
                  operation,
                  preview.fingerprint,
                  key,
                );
                await onSaved();
              })
            }
          >
            Send offer for employee response
          </button>
        ) : null}
        {intent === "section" ? (
          <LineupSaveStatus state={autosave} onDiscard={onClose} />
        ) : null}
        <footer className="lu-dialog-footer">
          <button
            type="button"
            className="nf-button secondary"
            disabled={busy || autosave.saving}
            onClick={() => void close()}
          >
            {intent === "section" ? "Done" : "Cancel"}
          </button>
          <button
            type="submit"
            ref={reviewButton}
            className="nf-button lu-primary"
            disabled={
              busy ||
              (operational && staffingReadUnavailable) ||
              Boolean(preview && !previewIsCurrent) ||
              autosave.saving ||
              Boolean(row?.orphaned) ||
              (intent !== "section" && !complete) ||
              ((intent === "assign" || intent === "replace") && !employee) ||
              (intent === "swap" && !requestSwap && !swapEntry) ||
              Boolean(preview && !preview.allowed)
            }
          >
            {busy
              ? "Saving…"
              : preview
                ? preview.requires_approval
                  ? "Request approval"
                  : preview.availability_warning?.policy === "confirm"
                    ? "Assign anyway"
                    : "Confirm change"
                : operational
                  ? "Review impact"
                  : intent === "extra"
                    ? "Create extra line"
                    : "Save assignment"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
      {row && intent === "section" ? (
        <div className="lu-secondary-actions">
          {row.employee_id && row.source_shift_id ? (
            <>
              <button
                disabled={busy || autosave.saving || row.orphaned}
                onClick={async () => {
                  if (!(await autosave.flush())) return;
                  const current = currentRow.current ?? row;
                  change({
                    date,
                    location_id: location.id,
                    job_id: current.job_id ?? "",
                    shift_type_id: current.shift_type_id ?? "",
                    section_id: current.section_id,
                    station: current.station,
                    start_time: current.start_time ?? "",
                    end_time: current.end_time ?? "",
                  });
                  setTravel(0);
                  setSwapEntry(null);
                  setRequestSwap(false);
                  setIntent("release");
                }}
              >
                Remove assignment · keep need open
              </button>
              <button
                disabled={busy || autosave.saving}
                onClick={async () => {
                  if (!(await autosave.flush())) return;
                  const query = new URLSearchParams({
                    date,
                    view: "day",
                    locations: location.id,
                    employees: row.employee_id!,
                    shiftTypes: row.shift_type_id ?? "",
                    jobs: row.job_id ?? "",
                  });
                  onClose();
                  navigate(`/app/schedule?${query}`);
                }}
              >
                Review shift cancellation in Schedule
              </button>
              <p className="lu-field-help">
                Removing the assignment leaves coverage open. To cancel the
                shift and its coverage need, review and publish the change in
                Schedule.
              </p>
            </>
          ) : null}
          <button
            disabled={
              busy || autosave.saving || !liveRow?.section_id || row.orphaned
            }
            onClick={() =>
              void run(async () => {
                if (!(await autosave.flush())) return;
                const saved = await saveLineupEntry(
                  workspaceId,
                  location.id,
                  date,
                  {
                    ...entryInput(currentRow.current ?? row),
                    section_id: null,
                    station: "",
                    placement_segments: [],
                  },
                  identity.current.id,
                  identity.current.revision,
                );
                await onSaved(saved);
              })
            }
          >
            Remove from section
          </button>
          {row.employee_id ? (
            <button
              disabled={busy || autosave.saving || row.orphaned}
              onClick={() =>
                void run(async () => {
                  if (!(await autosave.flush())) return;
                  const saved = await saveLineupEntry(
                    workspaceId,
                    location.id,
                    date,
                    {
                      ...entryInput(currentRow.current ?? row),
                      call_off: !row.call_off,
                    },
                    identity.current.id,
                    identity.current.revision,
                  );
                  await onSaved(saved);
                })
              }
            >
              {row.call_off ? "Undo call-off" : "Mark called off"}
            </button>
          ) : null}
          {!row.employee_id && !row.source_shift_id ? (
            <button
              disabled={busy || autosave.saving}
              onClick={() =>
                void run(async () => {
                  if (!(await autosave.flush())) return;
                  await saveLineupEntry(
                    workspaceId,
                    location.id,
                    date,
                    { ...entryInput(currentRow.current ?? row), hidden: true },
                    identity.current.id,
                    identity.current.revision,
                  );
                  await onSaved();
                })
              }
            >
              Cancel open need
            </button>
          ) : null}
        </div>
      ) : null}
    </LineupDialog>
  );
}
