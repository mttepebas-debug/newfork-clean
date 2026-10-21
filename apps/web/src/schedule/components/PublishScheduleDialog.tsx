import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationOverrideInput,
  SchedulePublicationPreflightAck,
  ScheduleOpenShiftChoice,
  SchedulePublicationPreview,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import {
  AlertTriangle,
  Check,
  Loader2,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useToast } from "@newfork/ui";

import {
  parsePublishPreflightError,
  canContinueWarnOnlyPublication,
  parsePublishRecoveryError,
  publishScheduleConflictKey,
  publishScheduleConflictLabel,
  type PublishScheduleConflict,
  type PublishDocumentScheduleConflictSummary,
} from "../lib/schedulePublishRecovery";
import {
  PublishPreflightPanel,
  type PublishPreflightBlockReason,
  publishGatingRisks,
  publishHardBlockers,
  publishOverrideableBlockers,
  publishNewAvailabilityFindings,
  countLabel,
} from "./PublishPreflightPanel";
import { formatShortDateTime } from "../lib/scheduleDateTime";
import { PublishOpenShiftsChoice } from "./PublishOpenShiftsChoice";
import { useCloseOnEscape } from "../lib/useCloseOnEscape";
import { LinesOutline, LoadError } from "../../shell/LoadState";
import { requestErrorText } from "../../lib/request-error";

export interface SchedulePublicationDepartmentScope {
  readonly departmentIds?: readonly string[];
  readonly includeNoDepartment?: boolean;
}

export interface SchedulePublicationChoices {
  readonly draftId: string;
  readonly locationIds: readonly string[];
  readonly departmentKeys: readonly string[];
}

const EMPTY_DEPARTMENTS: ScheduleReadModel["departments"] = [];
const STEP_TITLES: Record<1 | 2, string> = {
  1: "Select locations to publish",
  2: "Pre-flight check",
};
// One line under the title saying what the step does; nothing goes live
// before the last button.
const STEP_DESCRIPTIONS: Record<1 | 2, string> = {
  1: "Choose the draft and the locations that go live. Nothing is published until the last step.",
  2: "Review what needs attention first, then what changes at each location.",
};

type LocationPreviewSummary = SchedulePublicationPreview["locations"][number];

function shiftCountLabel(count: number): string {
  return count === 1 ? "shift" : "shifts";
}

// Somebody published or unpublished the location after this draft's work
// there started; the publisher decides knowing it (user decision 2026-09-24).
function changedSinceStartText(
  change: NonNullable<LocationPreviewSummary["changed_since_start"]>,
): string {
  const when = formatShortDateTime(change.at);
  return change.kind === "published"
    ? `${change.by_name} published this location on ${when}, after this draft was started. Publishing replaces that version.`
    : `${change.by_name} unpublished this location on ${when}, after this draft was started. Publishing makes it live again.`;
}

function locationColor(location: ScheduleLocation): string {
  return (location as ScheduleLocation & { readonly color?: string | null }).color ?? "var(--theme-swatch-fallback)";
}

export function PublishScheduleDialog({
  drafts,
  activeDraftId = null,
  locations,
  departments = EMPTY_DEPARTMENTS,
  employees,
  initialLocationIds,
  documentReviewVersion = 0,
  isPublishing = false,
  onClose,
  onPreview,
  onPublish,
  onReviewDocumentConflict,
  initialChoices,
  onReviewShift,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly activeDraftId?: string | null;
  readonly locations: readonly ScheduleLocation[];
  readonly departments?: ScheduleReadModel["departments"];
  readonly employees: readonly ScheduleEmployee[];
  readonly initialLocationIds?: readonly string[];
  readonly documentReviewVersion?: number;
  readonly isPublishing?: boolean;
  readonly initialChoices?: SchedulePublicationChoices | null;
  readonly onReviewShift?: (finding: SchedulePublicationPreview["findings"][number], choices: SchedulePublicationChoices) => Promise<void>;
  readonly onClose: () => void;
  readonly onPreview: (
    draftId: string,
    locationIds: string[],
    departmentScope: SchedulePublicationDepartmentScope,
  ) => Promise<SchedulePublicationPreview>;
  readonly onPublish: (
    preview: SchedulePublicationPreview,
    overrides: SchedulePublicationOverrideInput[],
    preflightAck?: SchedulePublicationPreflightAck,
    departmentScope?: SchedulePublicationDepartmentScope,
    openShifts?: ScheduleOpenShiftChoice,
  ) => Promise<unknown>;
  readonly onReviewDocumentConflict?: (
    conflict: PublishDocumentScheduleConflictSummary,
  ) => void;
}) {
  const toast = useToast();
  const noDepartmentKey = "__no_department__";
  const initialDraftId =
    (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)
      ? activeDraftId
      : drafts[0]?.id) ?? "";
  const restoredChoices = initialChoices?.draftId === initialDraftId ? initialChoices : null;
  const [draftId, setDraftId] = useState(initialDraftId);
  const [step, setStep] = useState<1 | 2>(1);
  // One choice for every open shift the publish brings (Mert, 2026-10-20); offering is the default.
  const [openShiftChoice, setOpenShiftChoice] = useState<ScheduleOpenShiftChoice>("offer");
  const allDepartmentKeys = useMemo(
    () =>
      departments.length
        ? [...departments.map((department) => department.id), noDepartmentKey]
        : [],
    [departments],
  );
  const [selectedDepartmentKeys, setSelectedDepartmentKeys] =
    useState<string[]>(restoredChoices ? allDepartmentKeys.filter((key) => restoredChoices.departmentKeys.includes(key)) : allDepartmentKeys);
  const [locationIds, setLocationIds] = useState(() =>
    restoredChoices
      ? locations.map((location) => location.id).filter((id) => restoredChoices.locationIds.includes(id))
      : initialLocationIds?.length
      ? locations
          .map((location) => location.id)
          .filter((id) => initialLocationIds.includes(id))
      : locations.map((location) => location.id),
  );
  const [preview, setPreview] = useState<SchedulePublicationPreview | null>(
    null,
  );
  const [preflightBlockReason, setPreflightBlockReason] =
    useState<PublishPreflightBlockReason | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [scheduleConflicts, setScheduleConflicts] = useState<
    readonly PublishScheduleConflict[]
  >([]);
  const [pending, setPending] = useState(false);
  const [reviewingShift, setReviewingShift] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const publishingRef = useRef(false);
  // BL-301: while a publication is sending the window stays; closing it
  // would drop the answer, and a failure would go unseen.
  const [sending, setSending] = useState(false);
  useEffect(() => () => { previewRequestIdRef.current += 1; }, []);
  const lastDocumentReviewVersionRef = useRef(documentReviewVersion);
  const resumePreviewRef = useRef(Boolean(restoredChoices));
  const hasDrafts = drafts.length > 0;
  const hasDepartmentSelection =
    departments.length === 0 || selectedDepartmentKeys.length > 0;
  const selectedLocationSummary = `${locationIds.length} of ${countLabel(locations.length, "location", "locations")} selected`;
  const draftIdsKey = drafts.map((draft) => draft.id).join("|");
  const locationIdsKey = locations.map((location) => location.id).join("|");
  const initialLocationIdsKey = (initialLocationIds ?? []).join("|");
  const departmentIdsKey = departments
    .map((department) => department.id)
    .join("|");
  const allDepartmentKeysKey = allDepartmentKeys.join("|");
  const selectedDepartmentKeysKey = selectedDepartmentKeys.join("|");
  const selectedLocationIdsKey = locationIds.join("|");
  const departmentScope = useMemo(() => {
    if (!departments.length || !selectedDepartmentKeys.length) return {};
    if (
      allDepartmentKeys.every((key) => selectedDepartmentKeys.includes(key))
    ) {
      return {};
    }
    return {
      departmentIds: selectedDepartmentKeys.filter(
        (key) => key !== noDepartmentKey,
      ),
      includeNoDepartment: selectedDepartmentKeys.includes(noDepartmentKey),
    };
  }, [allDepartmentKeys, departments.length, selectedDepartmentKeys]);
  const hardFindings = preview ? publishHardBlockers(preview) : [];
  const hasHardBlocker = hardFindings.length > 0;
  const publishBlocked =
    hasHardBlocker ||
    preview?.status === "hard_blocked" ||
    preview?.status === "past_week_closed";
  const wizardStep = step;
  const stepOnePreviewPending = wizardStep === 1 && pending;
  const stepOnePreviewError =
    wizardStep === 1 && error && !scheduleConflicts.length;
  const previewSummaryByLocationId = useMemo(() => {
    const summaries = new Map<string, LocationPreviewSummary>();
    for (const location of preview?.locations ?? []) {
      summaries.set(location.location_id, location);
    }
    return summaries;
  }, [preview]);
  const affectedEmployeeIds = useMemo(
    () => [
      ...new Set(
        preview?.locations.flatMap(
          (location) => location.affected_employee_ids ?? [],
        ) ?? [],
      ),
    ],
    [preview],
  );
  // The summary line describes the preview it was built from; while another
  // draft's preview is loading (or failed) it stays hidden rather than mixing
  // the new name with the old counts.
  const summaryPreview = preview?.draft_id === draftId ? preview : null;
  const nextShiftCount =
    summaryPreview?.locations.reduce((total, location) => total + location.next_shift_count, 0) ?? 0;
  useEffect(() => {
    const requestedDraftId =
      activeDraftId && drafts.some((draft) => draft.id === activeDraftId)
        ? activeDraftId
        : null;
    const nextDraftId = requestedDraftId ?? drafts[0]?.id ?? "";
    setDraftId((current) => {
      if (requestedDraftId) return requestedDraftId;
      return current && drafts.some((draft) => draft.id === current)
        ? current
        : nextDraftId;
    });
    setLocationIds(
      restoredChoices
        ? locations.map((location) => location.id).filter((id) => restoredChoices.locationIds.includes(id))
        : initialLocationIds?.length
        ? locations
            .map((location) => location.id)
            .filter((id) => initialLocationIds.includes(id))
        : locations.map((location) => location.id),
    );
    setSelectedDepartmentKeys(restoredChoices ? allDepartmentKeys.filter((key) => restoredChoices.departmentKeys.includes(key)) : allDepartmentKeys);
    setPreview(null);
    setStep(1);
    setPreflightBlockReason(null);
    setStaleNotice(null);
    setScheduleConflicts([]);
    setError(null);
  }, [
    activeDraftId,
    allDepartmentKeysKey,
    departmentIdsKey,
    draftIdsKey,
    initialLocationIdsKey,
    locationIdsKey,
  ]);

  useEffect(() => {
    setPreview(null);
    setStep(1);
    setPreflightBlockReason(null);
    setStaleNotice(null);
    setScheduleConflicts([]);
    setError(null);
  }, [selectedDepartmentKeysKey]);

  const toggleLocation = (id: string) => {
    setLocationIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    forgetCheck();
  };
  // A new choice (draft or locations) makes the last check someone else's
  // (BL-299): drop it, so Next checks again instead of reviewing it.
  const forgetCheck = () => {
    setPreview(null);
    setStep(1);
    setPreflightBlockReason(null);
    setStaleNotice(null);
    setScheduleConflicts([]);
  };
  const toggleDepartmentKey = (id: string) => {
    setSelectedDepartmentKeys((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };
  const applyPreview = (nextPreview: SchedulePublicationPreview) => {
    setPreview(nextPreview);
    setPreflightBlockReason(null);
  };

  const loadPreview = async (advance = true) => {
    if (!hasDrafts || !draftId || locationIds.length === 0 || !hasDepartmentSelection) return;
    const requestId = ++previewRequestIdRef.current;
    setPending(true);
    setError(null);
    setStaleNotice(null);
    setScheduleConflicts([]);
    try {
      const nextPreview = await onPreview(
        draftId,
        locationIds,
        departmentScope,
      );
      if (requestId !== previewRequestIdRef.current) return;
      applyPreview(nextPreview);
      if (advance || resumePreviewRef.current) setStep(2);
      resumePreviewRef.current = false;
    } catch (caught) {
      if (requestId !== previewRequestIdRef.current) return;
      setError(requestErrorText(caught));
    } finally {
      if (requestId === previewRequestIdRef.current) setPending(false);
    }
  };

  useEffect(() => {
    if (!hasDrafts || !draftId || locationIds.length === 0 || !hasDepartmentSelection) {
      previewRequestIdRef.current += 1;
      setPending(false);
      return;
    }
    void loadPreview(false);
  }, [
    departmentScope,
    draftId,
    hasDepartmentSelection,
    hasDrafts,
    selectedDepartmentKeysKey,
    selectedLocationIdsKey,
  ]);

  useEffect(() => {
    if (documentReviewVersion === lastDocumentReviewVersionRef.current) return;
    lastDocumentReviewVersionRef.current = documentReviewVersion;
    if (
      !documentReviewVersion ||
      !scheduleConflicts.length ||
      !hasDrafts ||
      !draftId ||
      locationIds.length === 0 ||
      !hasDepartmentSelection
    ) {
      return;
    }
    const requestId = ++previewRequestIdRef.current;
    setPending(true);
    setError(null);
    setStaleNotice(null);
    setScheduleConflicts([]);
    onPreview(draftId, locationIds, departmentScope)
      .then((nextPreview) => {
        if (requestId !== previewRequestIdRef.current) return;
        applyPreview(nextPreview);
      })
      .catch((caught) => {
        if (requestId !== previewRequestIdRef.current) return;
        setError(requestErrorText(caught));
      })
      .finally(() => {
        if (requestId === previewRequestIdRef.current) setPending(false);
      });
  }, [
    departmentScope,
    documentReviewVersion,
    draftId,
    hasDepartmentSelection,
    hasDrafts,
    locationIds,
    onPreview,
    scheduleConflicts.length,
  ]);
  const publish = async () => {
    if (!preview || publishBlocked || publishingRef.current) return;
    publishingRef.current = true;
    setSending(true);
    const requestId = ++previewRequestIdRef.current;
    const isCurrent = () => requestId === previewRequestIdRef.current;
    setPending(true);
    setError(null);
    try {
      let currentPreview = preview;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        // An acknowledgement names the finding; the database records who and
        // when (BL-186, BL-190).
        const overrideDecisions = [...publishOverrideableBlockers(currentPreview), ...publishGatingRisks(currentPreview),
          ...publishNewAvailabilityFindings(currentPreview)].map((finding) => ({ finding_id: finding.id }));
        try {
          const ack = { fingerprint: currentPreview.fingerprint, decisions: overrideDecisions };
          // The open shifts' choice goes only when the publish asked it.
          if (currentPreview.open_shifts?.length)
            await onPublish(currentPreview, overrideDecisions, ack, departmentScope, openShiftChoice);
          else await onPublish(currentPreview, overrideDecisions, ack, departmentScope);
          break;
        } catch (caught) {
          if (!isCurrent()) return;
          const refreshed = parsePublishPreflightError(caught);
          if (attempt === 0 && refreshed?.blockReason === "stale_fingerprint" && canContinueWarnOnlyPublication(currentPreview, refreshed.preview)) {
            currentPreview = refreshed.preview;
            setPreview(currentPreview);
            const count = publishNewAvailabilityFindings(currentPreview).filter(finding => finding.warning_policy === "warn").length;
            toast.warning(
              count ? "Schedule conflicts updated" : "Schedule warnings cleared",
              {
                dedupeKey: "schedule-publish-availability-refreshed",
                description: count
                  ? `${count} ${count === 1 ? "conflict" : "conflicts"} refreshed. Publication is continuing.`
                  : "Publication is continuing with the latest conflict check.",
              },
            );
            continue;
          }
          throw caught;
        }
      }
    } catch (caught) {
      if (!isCurrent()) return;
      const preflightError = parsePublishPreflightError(caught);
      if (preflightError) {
        setPreview(preflightError.preview);
        setStep(2);
        setPreflightBlockReason(preflightError.blockReason);
        setError(null);
      } else {
        const recoveryError = parsePublishRecoveryError(caught);
        if (recoveryError?.type === "stale_baseline") {
          setStaleNotice(recoveryError.message);
          setScheduleConflicts([]);
          setPreview(null);
          setStep(1);
          setError(null);
          if (hasDrafts && draftId && locationIds.length > 0 && hasDepartmentSelection) {
            try {
              const nextPreview = await onPreview(
                draftId,
                locationIds,
                departmentScope,
              );
              if (requestId === previewRequestIdRef.current) {
                applyPreview(nextPreview);
              }
            } catch (refreshError) {
              if (requestId === previewRequestIdRef.current) {
                setError(requestErrorText(refreshError));
              }
            }
          }
        } else if (recoveryError?.type === "schedule_conflicts") {
          setScheduleConflicts(recoveryError.conflicts);
          setStaleNotice(null);
          setPreview(null);
          setStep(1);
          setError(null);
        } else {
          // Say why publishing stopped, not that the preview failed.
          setStaleNotice(requestErrorText(caught));
          setError(null);
          setPreview(null);
          setStep(1);
        }
      }
    } finally {
      publishingRef.current = false;
      setSending(false);
      if (isCurrent()) setPending(false);
    }
  };

  return (
    <Dialog title={STEP_TITLES[wizardStep]} description={STEP_DESCRIPTIONS[wizardStep]} onClose={reviewingShift || sending || isPublishing ? () => {} : () => { previewRequestIdRef.current += 1; onClose(); }}>
      <div className="schedule-publication-form">
        <div className="schedule-publication-steps" aria-label="Publish steps">
          {[
            { index: 1, label: "Locations" },
            { index: 2, label: "Pre-flight" },
          ].map(({ index, label }) => (
            <span
              key={index}
              aria-current={wizardStep === index ? "step" : undefined}
              data-active={wizardStep === index}
              data-complete={wizardStep > index}
            >
              <i aria-hidden>
                {wizardStep > index ? <Check size={12} /> : index}
              </i>
              {label}
            </span>
          ))}
        </div>
        {summaryPreview ? (
          <p className="schedule-publication-summary">
            <strong>{drafts.find((draft) => draft.id === summaryPreview.draft_id)?.name ?? "Draft"}</strong>
            <span>
              <strong>{summaryPreview.locations.length}</strong>{" "}
              {summaryPreview.locations.length === 1 ? "location" : "locations"}
            </span>
            <span>
              <strong>{nextShiftCount}</strong>{" "}
              {nextShiftCount === 1 ? "shift" : "shifts"}
            </span>
            <span>
              <strong>{affectedEmployeeIds.length}</strong>{" "}
              {affectedEmployeeIds.length === 1 ? "person will be told" : "people will be told"}
            </span>
          </p>
        ) : null}
        {wizardStep === 1 ? (
          <>
            {hasDrafts ? (
              <label>
                Saved draft
                <select
                  value={draftId}
                  onChange={(event) => {
                    setDraftId(event.target.value);
                    forgetCheck();
                  }}
                >
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="schedule-publication-recovery" role="status">
                Save a named draft before publishing this week.
              </p>
            )}
            {staleNotice ? (
              <p className="schedule-publication-recovery" role="alert">
                {staleNotice}
              </p>
            ) : null}
            {/* Loading and error in the "B" look (Mert 2026-10-14). */}
            {stepOnePreviewPending && !preview ? (
              <LinesOutline label="Loading publish preview" />
            ) : stepOnePreviewError ? (
              // Every new choice drops the last preview (BL-299), so there is no older one to keep.
              <LoadError
                title="We couldn't load the publish preview"
                detail="The publish preview didn't load. Nothing was published."
                onRetry={() => void loadPreview(false)}
                inset
                level={3}
              />
            ) : null}
            {departments.length ? (
              <fieldset className="schedule-publication-departments">
                <legend>Departments to publish</legend>
                <div>
                  {departments.map((department) => (
                    <label key={department.id}>
                      <input
                        type="checkbox"
                        checked={selectedDepartmentKeys.includes(department.id)}
                        onChange={() => toggleDepartmentKey(department.id)}
                      />
                      <span>{department.name}</span>
                    </label>
                  ))}
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedDepartmentKeys.includes(noDepartmentKey)}
                      onChange={() => toggleDepartmentKey(noDepartmentKey)}
                    />
                    <span>No department</span>
                  </label>
                </div>
                {!hasDepartmentSelection ? (
                  <small>Select at least one department to publish.</small>
                ) : null}
              </fieldset>
            ) : null}
            <fieldset className="schedule-publication-locations">
              <legend>Locations to publish</legend>
              {locations.map((location) => {
                const summary = previewSummaryByLocationId.get(location.id);
                const selected = locationIds.includes(location.id);
                const liveShiftCount = summary?.current_shift_count ?? 0;
                const added = summary?.added ?? 0;
                const updated = summary?.updated ?? 0;
                const removed = summary?.removed ?? 0;
                const hasChanges = added > 0 || updated > 0 || removed > 0;

                return (
                  <label
                    key={location.id}
                    className="schedule-publication-location"
                    data-selected={selected}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleLocation(location.id)}
                    />
                    <span className="schedule-publication-location-body">
                      <span className="schedule-publication-location-heading">
                        <span className="schedule-publication-location-name">
                          <i
                            aria-hidden
                            style={{ backgroundColor: locationColor(location) }}
                          />
                          <strong>{location.name}</strong>
                        </span>
                        <small
                          className={
                            liveShiftCount > 0
                              ? "schedule-publication-live-chip"
                              : "schedule-publication-live-chip muted"
                          }
                        >
                          {summary
                            ? liveShiftCount > 0
                              ? `Live · ${liveShiftCount} ${shiftCountLabel(liveShiftCount)}`
                              : location.publication_status === "published"
                                ? "Published now"
                                : "Not published yet"
                            : location.publication_status === "published"
                              ? "Published now"
                              : "Not published"}
                        </small>
                      </span>
                      {summary ? (
                        <span className="schedule-publication-location-delta">
                          {added > 0 ? (
                            <small data-kind="new">{added} new</small>
                          ) : null}
                          {updated > 0 ? (
                            <small data-kind="updated">{updated} updated</small>
                          ) : null}
                          {removed > 0 ? (
                            <small data-kind="removed">{removed} removed</small>
                          ) : null}
                          {!hasChanges ? (
                            <small data-kind="none">No changes to publish</small>
                          ) : null}
                        </span>
                      ) : null}
                      {selected && liveShiftCount > 0 && removed === liveShiftCount ? (
                        <span className="schedule-publication-location-warning">
                          <AlertTriangle size={13} aria-hidden />
                          {liveShiftCount === 1
                            ? "The only live shift at this location will be removed."
                            : `All ${countLabel(liveShiftCount, "live shift", "live shifts")} at this location will be removed.`}
                        </span>
                      ) : null}
                      {selected && summary?.changed_since_start ? (
                        <span className="schedule-publication-location-warning">
                          <AlertTriangle size={13} aria-hidden />
                          {changedSinceStartText(summary.changed_since_start)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {stepOnePreviewPending && preview && locationIds.length > 0 ? (
              <div className="schedule-publication-preview-state" role="status">
                <Loader2 size={14} aria-hidden />
                Refreshing selected locations
              </div>
            ) : null}
            {scheduleConflicts.length ? (
              <section className="schedule-publication-conflicts" role="alert">
                <div>
                  <AlertTriangle size={16} aria-hidden />
                  <strong>
                    Schedule conflicts must be fixed before publishing
                  </strong>
                </div>
                {scheduleConflicts.slice(0, 8).map((conflict) => (
                  <div
                    key={publishScheduleConflictKey(conflict)}
                    className="schedule-publication-conflict-row"
                  >
                    <p>{publishScheduleConflictLabel(conflict)}</p>
                    {conflict.kind === "document_expiry" &&
                    conflict.review_action === "review_document" &&
                    conflict.pending_document_id &&
                    onReviewDocumentConflict ? (
                      <button
                        type="button"
                        onClick={() => onReviewDocumentConflict(conflict)}
                      >
                        Review document
                      </button>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
          </>
        ) : wizardStep === 2 && preview ? (
          <div
            className="schedule-publication-review"
            data-testid="schedule-publish-preview"
          >
            <PublishPreflightPanel
              preview={preview}
              locations={locations}
              employees={employees}
              blockReason={preflightBlockReason}
              reviewDisabled={pending || reviewingShift || isPublishing}
              onReviewShift={onReviewShift ? (finding) => {
                if (pending || reviewingShift || isPublishing) return;
                setReviewingShift(true);
                setError(null);
                void onReviewShift(finding, {
                  draftId, locationIds, departmentKeys: selectedDepartmentKeys,
                }).catch((caught: unknown) => {
                  setError(requestErrorText(caught, "The shift could not be opened. Try again."));
                }).finally(() => setReviewingShift(false));
              } : undefined}
            />
            {preview.open_shifts?.length ? (
              <PublishOpenShiftsChoice
                shifts={preview.open_shifts}
                choice={openShiftChoice}
                disabled={pending || reviewingShift || isPublishing}
                onChoose={setOpenShiftChoice}
              />
            ) : null}
            <div className="schedule-publication-diff">
              {preview.locations.map((location) => (
                <section key={location.location_id}>
                  <strong>{location.location_name}</strong>
                  <span>{location.next_shift_count} shifts after publish</span>
                  <dl>
                    <div>
                      <dt>Added</dt>
                      <dd>{location.added}</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{location.updated}</dd>
                    </div>
                    <div>
                      <dt>Removed</dt>
                      <dd>{location.removed}</dd>
                    </div>
                    <div>
                      <dt>Unchanged</dt>
                      <dd>{location.unchanged}</dd>
                    </div>
                  </dl>
                </section>
              ))}
            </div>
          </div>
        ) : null}
        {error && !stepOnePreviewError ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <span className="schedule-publication-footer-summary">
            {wizardStep === 1
              ? scheduleConflicts.length
                ? `${countLabel(scheduleConflicts.length, "conflict", "conflicts")} must be fixed`
                : selectedLocationSummary
              : // BL-441: Pre-flight says its count once, at the top.
                null}
          </span>
          {wizardStep > 1 ? (
            <button
              type="button"
              disabled={pending || reviewingShift || isPublishing}
              onClick={() => {
                setStep(1);
                setPreflightBlockReason(null);
                setStaleNotice(null);
                setScheduleConflicts([]);
                setError(null);
              }}
            >
              Back
            </button>
          ) : null}
          <button type="button" disabled={reviewingShift || sending || isPublishing} onClick={() => { previewRequestIdRef.current += 1; onClose(); }}>
            Cancel
          </button>
          {wizardStep === 2 ? (
            <button
              type="button"
              className="primary"
              disabled={pending || reviewingShift || isPublishing || !preview || publishBlocked}
              onClick={() => void publish()}
            >
              <Check size={15} />{" "}
              {pending || isPublishing
                ? "Publishing…"
                : `Publish ${locationIds.length} ${
                    locationIds.length === 1 ? "location" : "locations"
                  }`}
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              disabled={
                pending ||
                isPublishing ||
                !hasDrafts ||
                !draftId ||
                locationIds.length === 0 ||
                !hasDepartmentSelection ||
                scheduleConflicts.length > 0
              }
              onClick={() => {
                if (preview) {
                  setStep(2);
                  return;
                }
                void loadPreview(true);
              }}
            >
              {pending ? "Checking…" : "Next"}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const titleId = useId();
  useCloseOnEscape(onClose);

  return (
    <div
      className="schedule-dialog-layer"
      role="presentation"
      data-schedule-quiet-dialog
    >
      <button
        type="button"
        className="schedule-dialog-backdrop"
        aria-label="Close dialog"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      />
      <section
        className="schedule-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-description`}
      >
        <header>
          <div className="schedule-quiet-dialog-heading">
            <h2 id={titleId}>{title}</h2>
            <p id={`${titleId}-description`}>{description}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
