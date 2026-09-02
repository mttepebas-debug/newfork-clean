import type {
  ScheduleDraftSummary,
  ScheduleEmployee,
  ScheduleLocation,
  SchedulePublicationOverrideInput,
  SchedulePublicationPreflightAck,
  SchedulePublicationPreview,
  ScheduleReadModel,
} from "@newfork/shared/schedule";
import {
  AlertTriangle,
  Check,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import {
  parsePublishPreflightError,
  parsePublishRecoveryError,
  publishScheduleConflictLabel,
  type PublishScheduleConflictSummary,
} from "../lib/schedulePublishRecovery";
import {
  PublishPreflightPanel,
  type PublishPreflightBlockReason,
  publishGatingRisks,
  publishHardBlockers,
  publishOverrideableBlockers,
} from "./PublishPreflightPanel";

export interface SchedulePublicationDepartmentScope {
  readonly departmentIds?: readonly string[];
  readonly includeNoDepartment?: boolean;
}

const EMPTY_DEPARTMENTS: ScheduleReadModel["departments"] = [];
const STEP_TITLES: Record<1 | 2 | 3, string> = {
  1: "Select locations to publish",
  2: "Pre-flight check",
  3: "Notify employees",
};

type LocationPreviewSummary = SchedulePublicationPreview["locations"][number] & {
  readonly kept_worked?: number;
  readonly kept_worked_count?: number;
  readonly live_shift_count?: number;
};

function shiftCountLabel(count: number): string {
  return count === 1 ? "shift" : "shifts";
}

function keptWorkedCount(summary: LocationPreviewSummary | undefined): number {
  return summary?.kept_worked ?? summary?.kept_worked_count ?? 0;
}

function locationColor(location: ScheduleLocation): string {
  return (location as ScheduleLocation & { readonly color?: string | null }).color ?? "#64748b";
}

function employeeColor(employee: ScheduleEmployee): string {
  return (
    (employee as ScheduleEmployee & { readonly color?: string | null }).color ??
    "#cbd5e1"
  );
}

export function PublishScheduleDialog({
  drafts,
  activeDraftId = null,
  locations,
  departments = EMPTY_DEPARTMENTS,
  employees,
  initialLocationIds,
  isPublishing = false,
  onClose,
  onPreview,
  onPublish,
}: {
  readonly drafts: readonly ScheduleDraftSummary[];
  readonly activeDraftId?: string | null;
  readonly locations: readonly ScheduleLocation[];
  readonly departments?: ScheduleReadModel["departments"];
  readonly employees: readonly ScheduleEmployee[];
  readonly initialLocationIds?: readonly string[];
  readonly isPublishing?: boolean;
  readonly onClose: () => void;
  readonly onPreview: (
    draftId: string,
    locationIds: string[],
    departmentScope: SchedulePublicationDepartmentScope,
  ) => Promise<SchedulePublicationPreview>;
  readonly onPublish: (
    preview: SchedulePublicationPreview,
    overrides: SchedulePublicationOverrideInput[],
    notifyEmployeeIds: string[],
    preflightAck?: SchedulePublicationPreflightAck,
    departmentScope?: SchedulePublicationDepartmentScope,
  ) => Promise<unknown>;
}) {
  const noDepartmentKey = "__no_department__";
  const initialDraftId =
    (activeDraftId && drafts.some((draft) => draft.id === activeDraftId)
      ? activeDraftId
      : drafts[0]?.id) ?? "";
  const [draftId, setDraftId] = useState(initialDraftId);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const allDepartmentKeys = useMemo(
    () =>
      departments.length
        ? [...departments.map((department) => department.id), noDepartmentKey]
        : [],
    [departments],
  );
  const [selectedDepartmentKeys, setSelectedDepartmentKeys] =
    useState<string[]>(allDepartmentKeys);
  const [locationIds, setLocationIds] = useState(() =>
    initialLocationIds?.length
      ? locations
          .map((location) => location.id)
          .filter((id) => initialLocationIds.includes(id))
      : locations.map((location) => location.id),
  );
  const [preview, setPreview] = useState<SchedulePublicationPreview | null>(
    null,
  );
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [risksAcknowledged, setRisksAcknowledged] = useState(false);
  const [preflightBlockReason, setPreflightBlockReason] =
    useState<PublishPreflightBlockReason | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [scheduleConflicts, setScheduleConflicts] = useState<
    readonly PublishScheduleConflictSummary[]
  >([]);
  const [notifyEmployeeIds, setNotifyEmployeeIds] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRequestIdRef = useRef(0);
  const hasDrafts = drafts.length > 0;
  const hasDepartmentSelection =
    departments.length === 0 || selectedDepartmentKeys.length > 0;
  const selectedLocationSummary = `${locationIds.length} of ${locations.length} locations selected`;
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
  const softFindings = preview ? publishOverrideableBlockers(preview) : [];
  const hardFindings = preview ? publishHardBlockers(preview) : [];
  const riskFindings = preview ? publishGatingRisks(preview) : [];
  const hasHardBlocker = hardFindings.length > 0;
  const reasonsValid = softFindings.every(
    (finding) => (reasons[finding.id] ?? "").trim().length >= 10,
  );
  const risksValid = riskFindings.length === 0 || risksAcknowledged;
  const publishBlocked =
    hasHardBlocker ||
    !reasonsValid ||
    !risksValid ||
    preview?.status === "past_week_closed";
  const preflightReady =
    preview?.status === "publish_ready" &&
    hardFindings.length === 0 &&
    softFindings.length === 0 &&
    riskFindings.length === 0;
  const wizardStep = step;
  const stepOnePreviewPending = wizardStep === 1 && pending;
  const stepOnePreviewError =
    wizardStep === 1 && error && !scheduleConflicts.length;
  const publishSummary =
    preview && !preflightReady
      ? [
          hardFindings.length + softFindings.length
            ? `${hardFindings.length + softFindings.length} ${
                hardFindings.length + softFindings.length === 1
                  ? "blocker"
                  : "blockers"
              }`
            : null,
          riskFindings.length
            ? `${riskFindings.length} ${riskFindings.length === 1 ? "risk" : "risks"}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "Ready to publish";
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
  const notifyEmployees = useMemo(() => {
    const needle = employeeSearch.trim().toLocaleLowerCase();
    return affectedEmployeeIds
      .map((employeeId) =>
        employees.find((employee) => employee.id === employeeId),
      )
      .filter((employee): employee is ScheduleEmployee => Boolean(employee))
      .filter(
        (employee) =>
          !needle || employee.display_name.toLocaleLowerCase().includes(needle),
      )
      .sort((first, second) =>
        first.display_name.localeCompare(second.display_name),
      );
  }, [affectedEmployeeIds, employeeSearch, employees]);

  useEffect(() => {
    setNotifyEmployeeIds(affectedEmployeeIds);
    setEmployeeSearch("");
  }, [affectedEmployeeIds]);

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
      initialLocationIds?.length
        ? locations
            .map((location) => location.id)
            .filter((id) => initialLocationIds.includes(id))
        : locations.map((location) => location.id),
    );
    setSelectedDepartmentKeys(allDepartmentKeys);
    setPreview(null);
    setStep(1);
    setReasons({});
    setRisksAcknowledged(false);
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
    setReasons({});
    setRisksAcknowledged(false);
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
    setPreview(null);
    setStep(1);
    setRisksAcknowledged(false);
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
    setEmployeeSearch("");
    setNotifyEmployeeIds([
      ...new Set(
        nextPreview.locations.flatMap(
          (location) => location.affected_employee_ids ?? [],
        ),
      ),
    ]);
    setReasons({});
    setRisksAcknowledged(false);
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
      if (advance) setStep(2);
    } catch (caught) {
      if (requestId !== previewRequestIdRef.current) return;
      setError((caught as Error).message);
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
  const publish = async () => {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const overrideDecisions = softFindings.map((finding) => ({
        finding_id: finding.id,
        reason: reasons[finding.id]!.trim(),
      }));
      await onPublish(
        preview,
        overrideDecisions,
        notifyEmployeeIds,
        {
          fingerprint: preview.fingerprint,
          decisions: overrideDecisions,
        },
        departmentScope,
      );
    } catch (caught) {
      const preflightError = parsePublishPreflightError(caught);
      if (preflightError) {
        setPreview(preflightError.preview);
        setStep(2);
        setPreflightBlockReason(preflightError.blockReason);
        setRisksAcknowledged(false);
        setNotifyEmployeeIds([
          ...new Set(
            preflightError.preview.locations.flatMap(
              (location) => location.affected_employee_ids ?? [],
            ),
          ),
        ]);
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
            const requestId = ++previewRequestIdRef.current;
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
                setError((refreshError as Error).message);
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
          setError((caught as Error).message);
          setPreview(null);
          setStep(1);
        }
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog title={STEP_TITLES[wizardStep]} onClose={onClose}>
      <div className="schedule-publication-form">
        <div className="schedule-publication-steps" aria-label="Publish steps">
          {[
            { index: 1, label: "Locations" },
            { index: 2, label: "Pre-flight" },
            { index: 3, label: "Notify" },
          ].map(({ index, label }) => (
            <span
              key={index}
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
        {wizardStep === 1 ? (
          <>
            {hasDrafts ? (
              <label>
                Saved draft
                <select
                  value={draftId}
                  onChange={(event) => setDraftId(event.target.value)}
                >
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      {draft.name} · revision {draft.revision}
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
            {stepOnePreviewPending && !preview ? (
              <div className="schedule-publication-preview-state" role="status">
                <Loader2 size={14} aria-hidden />
                Loading publish preview
              </div>
            ) : null}
            {stepOnePreviewError ? (
              <div className="schedule-publication-preview-state error" role="alert">
                <span>Publish preview could not be loaded.</span>
                <button type="button" onClick={() => void loadPreview(false)}>
                  <RefreshCw size={13} aria-hidden />
                  Retry
                </button>
              </div>
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
                const liveShiftCount =
                  summary?.live_shift_count ?? summary?.current_shift_count ?? 0;
                const added = summary?.added ?? 0;
                const updated = summary?.updated ?? 0;
                const removed = summary?.removed ?? 0;
                const keptWorked = keptWorkedCount(summary);
                const hasChanges =
                  added > 0 ||
                  updated > 0 ||
                  removed > 0 ||
                  keptWorked > 0;

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
                          {keptWorked > 0 ? (
                            <small data-kind="kept">
                              {keptWorked} worked shifts kept
                            </small>
                          ) : null}
                          {!hasChanges ? (
                            <small data-kind="none">No changes to publish</small>
                          ) : null}
                        </span>
                      ) : null}
                      {selected && liveShiftCount > 0 && removed === liveShiftCount ? (
                        <span className="schedule-publication-location-warning">
                          <AlertTriangle size={13} aria-hidden />
                          All {liveShiftCount} live shifts at this location will be
                          removed.
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
                  <p
                    key={`${conflict.employee_id}-${conflict.first.shift_id}-${conflict.second.shift_id}`}
                  >
                    {publishScheduleConflictLabel(conflict)}
                  </p>
                ))}
              </section>
            ) : null}
          </>
        ) : wizardStep === 2 && preview ? (
          <div
            className="schedule-publication-review"
            data-testid="schedule-publish-preview"
          >
            <div
              className="schedule-publication-preflight"
              data-status={preview.status}
            >
              <span aria-hidden>
                {preflightReady ? (
                  <Check size={17} />
                ) : (
                  <ShieldAlert size={17} />
                )}
              </span>
              <div>
                <strong>{publishSummary}</strong>
                <small>
                  {preflightReady
                    ? "Nothing in this week's changes needs attention before it goes live."
                    : hasHardBlocker
                      ? "Fix hard blockers in the schedule before publishing."
                      : riskFindings.length
                        ? "Blockers stop the publish. Risks go live once acknowledged."
                        : "Every override is recorded with the published audit trail."}
                </small>
              </div>
            </div>
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
            <PublishPreflightPanel
              preview={preview}
              locations={locations}
              overrideReasons={reasons}
              onOverrideReasonChange={(findingId, value) =>
                setReasons((current) => ({
                  ...current,
                  [findingId]: value,
                }))
              }
              risksAcknowledged={risksAcknowledged}
              onRisksAcknowledgedChange={setRisksAcknowledged}
              blockReason={preflightBlockReason}
            />
          </div>
        ) : (
          <section className="schedule-publish-notify">
            <div className="schedule-publish-notify-heading">
              <div>
                <span>
                  {notifyEmployeeIds.length} of {affectedEmployeeIds.length}{" "}
                  selected
                </span>
                <small>Only employees with schedule changes are listed.</small>
              </div>
              {affectedEmployeeIds.length ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setNotifyEmployeeIds(affectedEmployeeIds)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyEmployeeIds([])}
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>
            {affectedEmployeeIds.length >= 15 ? (
              <label className="schedule-publish-notify-search">
                <Search size={15} aria-hidden />
                <input
                  aria-label="Search employees"
                  placeholder="Search employees"
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                />
              </label>
            ) : null}
            <div className="schedule-publish-notify-list">
              {notifyEmployees.length ? (
                notifyEmployees.map((employee) => (
                  <label key={employee.id}>
                    <input
                      type="checkbox"
                      checked={notifyEmployeeIds.includes(employee.id)}
                      onChange={() =>
                        setNotifyEmployeeIds((current) =>
                          current.includes(employee.id)
                            ? current.filter((id) => id !== employee.id)
                            : [...current, employee.id],
                        )
                      }
                    />
                    <span
                      aria-hidden
                      style={{ backgroundColor: employeeColor(employee) }}
                    />
                    <strong>{employee.display_name}</strong>
                  </label>
                ))
              ) : (
                <p>No affected employees.</p>
              )}
            </div>
          </section>
        )}
        {error && !stepOnePreviewError ? (
          <p className="schedule-overwrite-warning" role="alert">
            {error}
          </p>
        ) : null}
        <div className="schedule-dialog-actions">
          <span className="schedule-publication-footer-summary">
            {wizardStep === 1
              ? scheduleConflicts.length
                ? `${scheduleConflicts.length} conflicts must be fixed`
                : selectedLocationSummary
              : wizardStep === 2
                ? [
                    hardFindings.length + softFindings.length
                      ? `${hardFindings.length + softFindings.length} blockers`
                      : null,
                    riskFindings.length ? `${riskFindings.length} risks` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No blockers or risks"
                : `${notifyEmployeeIds.length} of ${affectedEmployeeIds.length} employees will be notified`}
          </span>
          {wizardStep > 1 ? (
            <button
              type="button"
              onClick={() => {
                if (wizardStep === 3) {
                  setStep(2);
                  return;
                }
                setStep(1);
                setRisksAcknowledged(false);
                setPreflightBlockReason(null);
                setStaleNotice(null);
                setScheduleConflicts([]);
                setError(null);
              }}
            >
              Back
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          {wizardStep === 2 ? (
            <button
              type="button"
              className="primary"
              disabled={pending || isPublishing || publishBlocked}
              onClick={() => setStep(3)}
            >
              {preflightReady ? "Next" : "Override and continue"}
            </button>
          ) : wizardStep === 3 ? (
            <button
              type="button"
              className="primary"
              disabled={pending || isPublishing || !preview || publishBlocked}
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
  onClose,
  children,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  return (
    <div
      className="schedule-dialog-layer"
      role="presentation"
      data-schedule-publish-surface
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
      >
        <header>
          <h2 id={titleId}>{title}</h2>
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
