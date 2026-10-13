import {
  Check,
  ClipboardCopy,
  Crosshair,
  Download,
  History,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent as ReactSyntheticEvent,
} from "react";

import { SchedulePage } from "../views/SchedulePage";
import {
  labInspectorControls,
  labInspectorGroups,
  labStates,
  labTargetGroups,
  labTargets,
  stateDefinition,
  targetElementSelector,
  type LabInspectorControl,
  type LabInspectorGroupId,
  type LabMode,
  type LabStateId,
} from "./scheduleShiftBadgeLabCatalog";
import {
  buildInspectorOverrideCss,
  buildLabAiBrief,
  buildLabJsonExport,
  inspectorChangeKey,
  inspectorCssValue,
  modeFromElement,
  resolveLabTarget,
  selectionForCatalogTarget,
  selectionForResolvedTarget,
  snapshotInspectorCssValues,
  snapshotInspectorValues,
  withSelectionScope,
  type LabChangeRecord,
  type LabControlValue,
  type LabSelection,
  type LabTargetScope,
} from "./scheduleShiftBadgeLabRuntime";
import "./ScheduleShiftBadgeLabPage.css";

type PanelView = "inspector" | "changes";

interface LabDocument {
  readonly changes: Readonly<Record<string, LabChangeRecord>>;
}

interface LabInspectorSnapshot {
  readonly values: Readonly<Record<string, LabControlValue>>;
  readonly cssValues: Readonly<Record<string, string>>;
}

interface TargetRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
}

const labStorageKey = "newfork.schedule-grid-lab.v2";
const MemoizedSchedulePage = memo(SchedulePage);
const defaultInspectorSnapshot: LabInspectorSnapshot = {
  values: Object.fromEntries(
    labInspectorControls.map((control) => [control.id, control.defaultValue]),
  ) as Record<string, LabControlValue>,
  cssValues: Object.fromEntries(
    labInspectorControls.map((control) => [
      control.id,
      inspectorCssValue(control, control.defaultValue) ??
        String(control.defaultValue),
    ]),
  ),
};

export default function ScheduleShiftBadgeLabPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedElementRef = useRef<HTMLElement | null>(null);
  const hoveredElementRef = useRef<HTMLElement | null>(null);
  const [labDocument, setLabDocument] = useState<LabDocument>(readLabDocument);
  const [snapshots, setSnapshots] = useState<
    Readonly<Record<string, LabInspectorSnapshot>>
  >({});
  const [controlsOpen, setControlsOpen] = useState(true);
  const [activeMode, setActiveMode] = useState<LabMode>("preview");
  const [detectedMode, setDetectedMode] = useState<LabMode | null>(null);
  const [panelView, setPanelView] = useState<PanelView>("inspector");
  const [inspectActive, setInspectActive] = useState(false);
  const [selection, setSelection] = useState<LabSelection | null>(null);
  const [activeState, setActiveState] = useState<LabStateId>("base");
  const [activeGroupId, setActiveGroupId] =
    useState<LabInspectorGroupId>("position");
  const [searchQuery, setSearchQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [activeDescription, setActiveDescription] = useState(
    "Select a Schedule Grid element or use the crosshair inspector.",
  );
  const [statusMessage, setStatusMessage] = useState("Changes saved locally");
  const [hoverRect, setHoverRect] = useState<TargetRect | null>(null);
  const [selectionRect, setSelectionRect] = useState<TargetRect | null>(null);

  const changeRecords = labDocument.changes;
  const overrideCss = useMemo(
    () => buildInspectorOverrideCss(changeRecords),
    [changeRecords],
  );

  const availableGroups =
    selection?.definition?.groups ??
    labInspectorGroups.map((group) => group.id);
  const effectiveGroupId = availableGroups.includes(activeGroupId)
    ? activeGroupId
    : (availableGroups[0] ?? "position");
  const availableStates =
    selection?.definition?.states ?? labStates.map((state) => state.id);
  const effectiveState = availableStates.includes(activeState)
    ? activeState
    : "base";
  const snapshotKey = selection
    ? createSnapshotKey(activeMode, selection, effectiveState)
    : "";
  const activeSnapshot = snapshotKey
    ? (snapshots[snapshotKey] ?? defaultInspectorSnapshot)
    : defaultInspectorSnapshot;

  const currentChangeFor = useCallback(
    (control: LabInspectorControl): LabChangeRecord | undefined => {
      if (!selection) return undefined;
      const key = inspectorChangeKey({
        mode: activeMode,
        selection,
        state: effectiveState,
        propertyId: control.id,
      });
      return changeRecords[key];
    },
    [activeMode, changeRecords, effectiveState, selection],
  );

  const visibleControls = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return labInspectorControls.filter((control) => {
      if (control.groupId !== effectiveGroupId) return false;
      if (changedOnly && !currentChangeFor(control)) return false;
      if (!normalizedQuery) return true;
      return [
        control.label,
        control.description,
        control.cssProperty,
        control.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [changedOnly, currentChangeFor, effectiveGroupId, searchQuery]);

  const selectedStateChangeCount = useMemo(() => {
    if (!selection) return 0;
    return Object.values(changeRecords).filter(
      (record) =>
        record.source === "inspector" &&
        record.mode === activeMode &&
        record.selector === selection.selector &&
        record.state === effectiveState,
    ).length;
  }, [activeMode, changeRecords, effectiveState, selection]);

  const rememberSnapshot = useCallback(
    (
      mode: LabMode,
      nextSelection: LabSelection,
      state: LabStateId = "base",
    ) => {
      const key = createSnapshotKey(mode, nextSelection, state);
      setSnapshots((current) =>
        current[key]
          ? current
          : {
              ...current,
              [key]: {
                values: snapshotInspectorValues(
                  nextSelection.element,
                  nextSelection.pseudoElement,
                ),
                cssValues: snapshotInspectorCssValues(
                  nextSelection.element,
                  nextSelection.pseudoElement,
                ),
              },
            },
      );
    },
    [],
  );

  const activateSelection = useCallback(
    (nextSelection: LabSelection, mode: LabMode) => {
      selectedElementRef.current?.removeAttribute("data-lab-inspect-selected");
      selectedElementRef.current = nextSelection.element;
      nextSelection.element?.setAttribute("data-lab-inspect-selected", "true");
      setSelection(nextSelection);
      setActiveState("base");
      setActiveGroupId(nextSelection.definition?.groups[0] ?? "position");
      setActiveDescription(nextSelection.targetDescription);
      setPanelView("inspector");
      setControlsOpen(true);
      rememberSnapshot(mode, nextSelection);
      setSelectionRect(
        rectForElement(nextSelection.element, nextSelection.targetLabel),
      );
    },
    [rememberSnapshot],
  );

  const chooseCatalogTarget = useCallback(
    (targetId: string, mode = activeMode) => {
      const root = rootRef.current;
      const definition = labTargets.find((target) => target.id === targetId);
      if (!root || !definition) return;
      activateSelection(
        selectionForCatalogTarget({ definition, mode, root }),
        mode,
      );
    },
    [activateSelection, activeMode],
  );

  const clearSelection = useCallback(() => {
    selectedElementRef.current?.removeAttribute("data-lab-inspect-selected");
    selectedElementRef.current?.removeAttribute("data-lab-force-state");
    selectedElementRef.current = null;
    setSelection(null);
    setSelectionRect(null);
    setActiveState("base");
  }, []);

  const switchMode = (mode: LabMode) => {
    setActiveMode(mode);
    if (selection?.definition && rootRef.current) {
      activateSelection(
        selectionForCatalogTarget({
          definition: selection.definition,
          mode,
          root: rootRef.current,
        }),
        mode,
      );
    } else {
      clearSelection();
    }
  };

  const updateInspectorValue = (
    control: LabInspectorControl,
    nextValue: LabControlValue,
  ) => {
    if (!selection) return;
    const newCssValue = inspectorCssValue(control, nextValue);
    if (!newCssValue) {
      setStatusMessage(`Invalid ${control.label} value`);
      return;
    }
    const oldValue = activeSnapshot.values[control.id] ?? control.defaultValue;
    const oldCssValue =
      activeSnapshot.cssValues[control.id] ??
      inspectorCssValue(control, oldValue) ??
      String(control.defaultValue);
    const key = inspectorChangeKey({
      mode: activeMode,
      selection,
      state: effectiveState,
      propertyId: control.id,
    });
    setLabDocument((current) => {
      const nextChanges = { ...current.changes };
      if (newCssValue === oldCssValue) {
        delete nextChanges[key];
      } else {
        const existing = current.changes[key];
        nextChanges[key] = {
          key,
          source: "inspector",
          mode: activeMode,
          targetId: selection.targetId,
          targetLabel: selection.targetLabel,
          targetDescription: selection.targetDescription,
          selector: selection.selector,
          semanticSelector: selection.semanticSelector,
          scope: selection.scope,
          state: effectiveState,
          propertyId: control.id,
          propertyLabel: control.label,
          propertyDescription: control.description,
          cssProperty: control.cssProperty,
          special: control.special,
          oldValue: existing?.oldValue ?? oldValue,
          newValue: normalizeControlValue(control, nextValue),
          oldCssValue: existing?.oldCssValue ?? oldCssValue,
          newCssValue,
          baseline: activeSnapshot.values,
          changedAt: new Date().toISOString(),
        };
      }
      return { changes: nextChanges };
    });
    setStatusMessage("Changes saved locally");
  };

  const removeChanges = (matches: (record: LabChangeRecord) => boolean) => {
    setLabDocument((current) => ({
      changes: Object.fromEntries(
        Object.entries(current.changes).filter(
          ([, record]) => !matches(record),
        ),
      ),
    }));
    setStatusMessage("Reset saved locally");
  };

  const resetProperty = (control: LabInspectorControl) => {
    if (!selection) return;
    const key = inspectorChangeKey({
      mode: activeMode,
      selection,
      state: effectiveState,
      propertyId: control.id,
    });
    removeChanges((record) => record.key === key);
  };

  const resetState = () => {
    if (!selection) return;
    removeChanges(
      (record) =>
        record.mode === activeMode &&
        record.selector === selection.selector &&
        record.state === effectiveState,
    );
  };

  const resetTarget = () => {
    if (!selection) return;
    removeChanges(
      (record) =>
        record.mode === activeMode && record.selector === selection.selector,
    );
  };

  const selectInspectedTarget = useCallback(
    (eventTarget: EventTarget | null) => {
      const root = rootRef.current;
      if (!root) return false;
      const resolved = resolveLabTarget(eventTarget, root);
      if (!resolved) return false;
      const mode = modeFromElement(resolved.element, activeMode);
      if (mode !== activeMode) setActiveMode(mode);
      activateSelection(
        selectionForResolvedTarget({ resolved, mode, root }),
        mode,
      );
      return true;
    },
    [activateSelection, activeMode],
  );

  const blockAndSelect = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!inspectActive || isLabPanelTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    selectInspectedTarget(event.target);
  };

  const blockMouseAction = (event: ReactSyntheticEvent<HTMLDivElement>) => {
    if (!inspectActive || isLabPanelTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleInspectKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!inspectActive || isLabPanelTarget(event.target)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setInspectActive(false);
      setHoverRect(null);
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    selectInspectedTarget(event.target);
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setStatusMessage(successMessage);
    } catch {
      setStatusMessage("Clipboard unavailable; use Download JSON");
    }
  };

  const downloadJson = () => {
    const blob = new Blob([buildLabJsonExport(changeRecords)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `schedule-grid-lab-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusMessage("Change log downloaded");
  };

  useEffect(() => {
    try {
      window.localStorage.setItem(
        labStorageKey,
        JSON.stringify({ schemaVersion: 2, changes: labDocument.changes }),
      );
    } catch {
      setStatusMessage("Local save unavailable");
    }
  }, [labDocument.changes]);

  useEffect(() => {
    if (selection || !rootRef.current) return;
    const definition = labTargets.find((target) => target.id === "shiftBadge");
    if (!definition) return;
    activateSelection(
      selectionForCatalogTarget({
        definition,
        mode: activeMode,
        root: rootRef.current,
      }),
      activeMode,
    );
  }, [activateSelection, activeMode, selection]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const syncModeAndSelection = () => {
      const editingOwner = root.querySelector<HTMLElement>("[data-editing]");
      if (editingOwner) {
        const nextMode =
          editingOwner.dataset.editing === "true" ? "edit" : "preview";
        setDetectedMode((current) =>
          current === nextMode ? current : nextMode,
        );
      }
      if (!selection?.definition || selection.element?.isConnected) return;
      const nextElement = root.querySelector<HTMLElement>(
        targetElementSelector(selection.definition, activeMode),
      );
      if (!nextElement) return;
      const nextSelection = { ...selection, element: nextElement };
      setSelection(nextSelection);
      selectedElementRef.current = nextElement;
      nextElement.setAttribute("data-lab-inspect-selected", "true");
      rememberSnapshot(activeMode, nextSelection);
      setSelectionRect(rectForElement(nextElement, nextSelection.targetLabel));
    };
    syncModeAndSelection();
    const observer = new MutationObserver(syncModeAndSelection);
    const schedulePage = root.querySelector(".schedule-page") ?? root;
    observer.observe(schedulePage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-editing"],
    });
    return () => observer.disconnect();
  }, [activeMode, rememberSnapshot, selection]);

  useEffect(() => {
    const element = selection?.element;
    if (!element) return undefined;
    const previousForceState = element.getAttribute("data-lab-force-state");
    const mirrored = mirroredStateAttribute(effectiveState);
    const previousMirrored = mirrored
      ? element.getAttribute(mirrored.name)
      : null;
    if (effectiveState === "base") {
      element.removeAttribute("data-lab-force-state");
    } else {
      element.setAttribute("data-lab-force-state", effectiveState);
      if (mirrored) element.setAttribute(mirrored.name, mirrored.value);
    }
    rememberSnapshot(activeMode, selection, effectiveState);
    return () => {
      restoreAttribute(element, "data-lab-force-state", previousForceState);
      if (mirrored) restoreAttribute(element, mirrored.name, previousMirrored);
    };
  }, [activeMode, effectiveState, rememberSnapshot, selection]);

  useEffect(() => {
    const element = selection?.element;
    if (!element) return undefined;
    const updateRect = () =>
      setSelectionRect(rectForElement(element, selection.targetLabel));
    updateRect();
    window.addEventListener("resize", updateRect);
    document.addEventListener("scroll", updateRect, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateRect);
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", updateRect);
      document.removeEventListener("scroll", updateRect, true);
      observer?.disconnect();
    };
  }, [selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!inspectActive || event.key !== "Escape") return;
      setInspectActive(false);
      setHoverRect(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [inspectActive]);

  return (
    <div
      ref={rootRef}
      className="schedule-badge-lab-clone"
      data-lab-mode={activeMode}
      data-inspecting={inspectActive}
      onPointerMoveCapture={(event) => {
        if (
          !inspectActive ||
          isLabPanelTarget(event.target) ||
          !rootRef.current
        ) {
          hoveredElementRef.current = null;
          setHoverRect(null);
          return;
        }
        const resolved = resolveLabTarget(event.target, rootRef.current);
        if (!resolved) {
          hoveredElementRef.current = null;
          setHoverRect(null);
          return;
        }
        if (hoveredElementRef.current === resolved.element) return;
        hoveredElementRef.current = resolved.element;
        setHoverRect(
          rectForElement(
            resolved.element,
            resolved.definition?.label ?? "Custom element",
          ),
        );
      }}
      onPointerDownCapture={blockAndSelect}
      onMouseDownCapture={blockMouseAction}
      onClickCapture={blockMouseAction}
      onAuxClickCapture={blockMouseAction}
      onDoubleClickCapture={blockMouseAction}
      onContextMenuCapture={blockMouseAction}
      onDragStartCapture={blockMouseAction}
      onCopyCapture={blockMouseAction}
      onPasteCapture={blockMouseAction}
      onKeyDownCapture={handleInspectKey}
    >
      <style data-testid="schedule-lab-override-styles">{overrideCss}</style>
      {inspectActive && hoverRect ? (
        <LabTargetOverlay kind="hover" rect={hoverRect} />
      ) : null}
      {selectionRect ? (
        <LabTargetOverlay kind="selected" rect={selectionRect} />
      ) : null}

      <aside
        className="schedule-badge-lab-panel"
        data-open={controlsOpen}
        aria-label="Schedule Grid lab controls"
      >
        <header className="schedule-badge-lab-panel-header">
          <button
            type="button"
            className="schedule-badge-lab-panel-title"
            aria-expanded={controlsOpen}
            onClick={() => setControlsOpen((open) => !open)}
          >
            <SlidersHorizontal size={15} aria-hidden />
            <span>Schedule Grid Lab</span>
          </button>
          <div className="schedule-badge-lab-header-actions">
            <button
              type="button"
              aria-label={
                inspectActive ? "Stop inspecting grid" : "Inspect grid element"
              }
              aria-pressed={inspectActive}
              title={
                inspectActive ? "Stop inspecting grid" : "Inspect grid element"
              }
              onClick={() => {
                setInspectActive((active) => !active);
                setHoverRect(null);
              }}
            >
              <Crosshair size={16} aria-hidden />
            </button>
            <button
              type="button"
              aria-label={
                controlsOpen ? "Collapse lab panel" : "Open lab panel"
              }
              title={controlsOpen ? "Collapse lab panel" : "Open lab panel"}
              onClick={() => setControlsOpen((open) => !open)}
            >
              {controlsOpen ? (
                <PanelRightClose size={16} aria-hidden />
              ) : (
                <PanelRightOpen size={16} aria-hidden />
              )}
            </button>
          </div>
        </header>

        {controlsOpen ? (
          <div className="schedule-badge-lab-controls">
            <div
              className="schedule-badge-lab-modes"
              role="tablist"
              aria-label="Lab page"
            >
              {(["preview", "edit"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={activeMode === mode}
                  data-grid-match={detectedMode === mode}
                  onClick={() => switchMode(mode)}
                >
                  {mode === "preview" ? "Preview Page" : "Edit Page"}
                </button>
              ))}
            </div>

            <div
              className="schedule-badge-lab-view-tabs"
              role="tablist"
              aria-label="Lab view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={panelView === "inspector"}
                onClick={() => setPanelView("inspector")}
              >
                Inspector
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={panelView === "changes"}
                onClick={() => setPanelView("changes")}
              >
                Changes <span>{Object.keys(changeRecords).length}</span>
              </button>
            </div>

            {panelView === "inspector" ? (
              <LabInspectorPanel
                activeDescription={activeDescription}
                activeGroupId={effectiveGroupId}
                activeMode={activeMode}
                activeSnapshot={activeSnapshot.values}
                activeState={effectiveState}
                availableGroups={availableGroups}
                availableStates={availableStates}
                changedOnly={changedOnly}
                currentChangeFor={currentChangeFor}
                detectedMode={detectedMode}
                inspectActive={inspectActive}
                searchQuery={searchQuery}
                selectedStateChangeCount={selectedStateChangeCount}
                selection={selection}
                visibleControls={visibleControls}
                onChooseTarget={chooseCatalogTarget}
                onControlChange={updateInspectorValue}
                onDescription={setActiveDescription}
                onGroupChange={setActiveGroupId}
                onInspectToggle={() => setInspectActive((active) => !active)}
                onResetProperty={resetProperty}
                onResetState={resetState}
                onResetTarget={resetTarget}
                onScopeChange={(scope) => {
                  if (!selection) return;
                  const next = withSelectionScope(selection, activeMode, scope);
                  activateSelection(next, activeMode);
                }}
                onSearchChange={setSearchQuery}
                onStateChange={setActiveState}
                onToggleChangedOnly={setChangedOnly}
              />
            ) : (
              <LabChangeLog
                changes={changeRecords}
                onClear={() => {
                  setLabDocument({ changes: {} });
                  setStatusMessage("Change log cleared");
                }}
                onCopyAi={() =>
                  void copyText(
                    buildLabAiBrief(changeRecords),
                    "AI brief copied",
                  )
                }
                onCopyJson={() =>
                  void copyText(
                    buildLabJsonExport(changeRecords),
                    "JSON copied",
                  )
                }
                onDownload={downloadJson}
              />
            )}

            <footer className="schedule-badge-lab-footer" aria-live="polite">
              {inspectActive ? (
                <span data-active="true">
                  <Crosshair size={13} aria-hidden /> Inspecting
                </span>
              ) : (
                <span>
                  <Check size={13} aria-hidden /> {statusMessage}
                </span>
              )}
              <span>
                Grid: {detectedMode ? capitalize(detectedMode) : "Loading"}
              </span>
            </footer>
          </div>
        ) : null}
      </aside>

      <MemoizedSchedulePage scheduleBasePath="/app/schedule-badge-lab" />
    </div>
  );
}

function LabInspectorPanel({
  activeDescription,
  activeGroupId,
  activeMode,
  activeSnapshot,
  activeState,
  availableGroups,
  availableStates,
  changedOnly,
  currentChangeFor,
  detectedMode,
  inspectActive,
  searchQuery,
  selectedStateChangeCount,
  selection,
  visibleControls,
  onChooseTarget,
  onControlChange,
  onDescription,
  onGroupChange,
  onInspectToggle,
  onResetProperty,
  onResetState,
  onResetTarget,
  onScopeChange,
  onSearchChange,
  onStateChange,
  onToggleChangedOnly,
}: {
  readonly activeDescription: string;
  readonly activeGroupId: LabInspectorGroupId;
  readonly activeMode: LabMode;
  readonly activeSnapshot: Readonly<Record<string, LabControlValue>>;
  readonly activeState: LabStateId;
  readonly availableGroups: readonly LabInspectorGroupId[];
  readonly availableStates: readonly LabStateId[];
  readonly changedOnly: boolean;
  readonly currentChangeFor: (
    control: LabInspectorControl,
  ) => LabChangeRecord | undefined;
  readonly detectedMode: LabMode | null;
  readonly inspectActive: boolean;
  readonly searchQuery: string;
  readonly selectedStateChangeCount: number;
  readonly selection: LabSelection | null;
  readonly visibleControls: readonly LabInspectorControl[];
  readonly onChooseTarget: (targetId: string) => void;
  readonly onControlChange: (
    control: LabInspectorControl,
    value: LabControlValue,
  ) => void;
  readonly onDescription: (description: string) => void;
  readonly onGroupChange: (groupId: LabInspectorGroupId) => void;
  readonly onInspectToggle: () => void;
  readonly onResetProperty: (control: LabInspectorControl) => void;
  readonly onResetState: () => void;
  readonly onResetTarget: () => void;
  readonly onScopeChange: (scope: LabTargetScope) => void;
  readonly onSearchChange: (query: string) => void;
  readonly onStateChange: (state: LabStateId) => void;
  readonly onToggleChangedOnly: (changedOnly: boolean) => void;
}) {
  return (
    <div className="schedule-badge-lab-inspector" role="tabpanel">
      <div className="schedule-badge-lab-target-row">
        <label>
          <span>Element</span>
          <select
            aria-label="Schedule Grid element"
            value={selection?.definition?.id ?? ""}
            onChange={(event) => onChooseTarget(event.currentTarget.value)}
          >
            {selection?.definition ? null : (
              <option value="">Custom selected element</option>
            )}
            {labTargetGroups.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {labTargets
                  .filter((target) => target.groupId === group.id)
                  .map((target) => (
                    <option key={target.id} value={target.id}>
                      {target.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="schedule-badge-lab-inspect-button"
          aria-pressed={inspectActive}
          title={inspectActive ? "Stop inspecting" : "Pick from grid"}
          onClick={onInspectToggle}
        >
          <Crosshair size={16} aria-hidden />
          <span>{inspectActive ? "Picking" : "Pick"}</span>
        </button>
      </div>

      <div
        className="schedule-badge-lab-breadcrumb"
        data-mode-match={detectedMode === activeMode}
      >
        <span>{capitalize(activeMode)}</span>
        <strong>{selection?.targetLabel ?? "No element"}</strong>
        <span>{stateDefinition(activeState).label}</span>
      </div>

      <div className="schedule-badge-lab-target-options">
        <div
          className="schedule-badge-lab-scope"
          role="group"
          aria-label="Target scope"
        >
          <button
            type="button"
            aria-pressed={selection?.scope === "type"}
            disabled={!selection?.definition}
            onClick={() => onScopeChange("type")}
          >
            All matching
          </button>
          <button
            type="button"
            aria-pressed={selection?.scope === "instance"}
            disabled={!selection?.element}
            onClick={() => onScopeChange("instance")}
          >
            This one
          </button>
        </div>
        <label>
          <span>State</span>
          <select
            aria-label="Element state"
            value={activeState}
            onChange={(event) =>
              onStateChange(event.currentTarget.value as LabStateId)
            }
          >
            {labStates
              .filter((state) => availableStates.includes(state.id))
              .map((state) => (
                <option key={state.id} value={state.id}>
                  {state.label}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="schedule-badge-lab-filter-row">
        <label className="schedule-badge-lab-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            aria-label="Filter properties"
            placeholder="Filter properties"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </label>
        <label className="schedule-badge-lab-changed-only">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(event) =>
              onToggleChangedOnly(event.currentTarget.checked)
            }
          />
          <span>Changed</span>
        </label>
      </div>

      <div
        className="schedule-badge-lab-property-tabs"
        role="tablist"
        aria-label="Property group"
      >
        {labInspectorGroups
          .filter((group) => availableGroups.includes(group.id))
          .map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeGroupId === group.id}
              onClick={() => onGroupChange(group.id)}
            >
              {group.label}
            </button>
          ))}
      </div>

      <div className="schedule-badge-lab-description" role="status">
        {activeDescription}
      </div>

      <div className="schedule-badge-lab-control-list">
        {visibleControls.length ? (
          visibleControls.map((control) => {
            const change = currentChangeFor(control);
            return (
              <LabInspectorControlRow
                key={control.id}
                control={control}
                value={
                  change?.newValue ??
                  activeSnapshot[control.id] ??
                  control.defaultValue
                }
                changed={Boolean(change)}
                onChange={(value) => onControlChange(control, value)}
                onDescription={onDescription}
                onReset={() => onResetProperty(control)}
              />
            );
          })
        ) : (
          <p className="schedule-badge-lab-empty">No matching properties</p>
        )}
      </div>

      <div className="schedule-badge-lab-reset-row">
        <button
          type="button"
          disabled={!selectedStateChangeCount}
          onClick={onResetState}
        >
          <RotateCcw size={14} aria-hidden /> Reset state
        </button>
        <button type="button" disabled={!selection} onClick={onResetTarget}>
          <Trash2 size={14} aria-hidden /> Reset element
        </button>
      </div>
    </div>
  );
}

function LabInspectorControlRow({
  control,
  value,
  changed,
  onChange,
  onDescription,
  onReset,
}: {
  readonly control: LabInspectorControl;
  readonly value: LabControlValue;
  readonly changed: boolean;
  readonly onChange: (value: LabControlValue) => void;
  readonly onDescription: (description: string) => void;
  readonly onReset: () => void;
}) {
  const descriptionId = useId();
  const describe = () => onDescription(control.description);
  return (
    <div
      className="schedule-badge-lab-control-row"
      data-changed={changed}
      title={control.description}
      onMouseEnter={describe}
      onFocus={describe}
    >
      <label htmlFor={`${descriptionId}-input`}>{control.label}</label>
      <LabControlInput
        control={control}
        id={`${descriptionId}-input`}
        value={value}
        describedBy={descriptionId}
        onChange={onChange}
      />
      <button
        type="button"
        className="schedule-badge-lab-property-reset"
        aria-label={`Reset ${control.label}`}
        title={`Reset ${control.label}`}
        disabled={!changed}
        onClick={onReset}
      >
        <RotateCcw size={13} aria-hidden />
      </button>
      <span id={descriptionId} className="schedule-badge-lab-sr-only">
        {control.description}
      </span>
    </div>
  );
}

function LabControlInput({
  control,
  id,
  value,
  describedBy,
  onChange,
}: {
  readonly control: LabInspectorControl;
  readonly id: string;
  readonly value: LabControlValue;
  readonly describedBy: string;
  readonly onChange: (value: LabControlValue) => void;
}) {
  if (control.kind === "number") {
    const numericValue = typeof value === "number" ? value : Number(value);
    const safeValue = Number.isFinite(numericValue)
      ? numericValue
      : control.defaultValue;
    const commit = (event: ChangeEvent<HTMLInputElement>) => {
      const parsed = Number(event.currentTarget.value);
      if (Number.isFinite(parsed)) onChange(parsed);
    };
    return (
      <div className="schedule-badge-lab-number-control">
        <input
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={safeValue}
          aria-label={`${control.label} slider`}
          aria-describedby={describedBy}
          onChange={commit}
        />
        <span>
          <input
            id={id}
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={safeValue}
            aria-label={`${control.label} value`}
            aria-describedby={describedBy}
            onChange={commit}
          />
          <small>{control.unit}</small>
        </span>
      </div>
    );
  }
  if (control.kind === "select") {
    return (
      <select
        id={id}
        value={String(value)}
        aria-label={control.label}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        {control.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (control.kind === "color") {
    const colorValue = /^#[0-9a-f]{6}$/i.test(String(value))
      ? String(value)
      : control.defaultValue;
    return (
      <div className="schedule-badge-lab-color-control">
        <input
          id={id}
          type="color"
          value={colorValue}
          aria-label={`${control.label} swatch`}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <input
          type="text"
          value={colorValue}
          aria-label={`${control.label} value`}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    );
  }
  return (
    <input
      id={id}
      type="text"
      value={String(value)}
      placeholder={control.placeholder}
      aria-label={`${control.label} value`}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

function LabChangeLog({
  changes,
  onCopyAi,
  onCopyJson,
  onDownload,
  onClear,
}: {
  readonly changes: Readonly<Record<string, LabChangeRecord>>;
  readonly onCopyAi: () => void;
  readonly onCopyJson: () => void;
  readonly onDownload: () => void;
  readonly onClear: () => void;
}) {
  const records = Object.values(changes).sort((left, right) =>
    right.changedAt.localeCompare(left.changedAt),
  );
  return (
    <div className="schedule-badge-lab-change-log" role="tabpanel">
      <div className="schedule-badge-lab-log-actions">
        <button type="button" title="Copy AI brief" onClick={onCopyAi}>
          <ClipboardCopy size={14} aria-hidden /> AI brief
        </button>
        <button type="button" title="Copy JSON" onClick={onCopyJson}>
          <ClipboardCopy size={14} aria-hidden /> JSON
        </button>
        <button type="button" title="Download JSON" onClick={onDownload}>
          <Download size={14} aria-hidden /> Download
        </button>
        <button
          type="button"
          className="danger"
          title="Clear change log"
          disabled={!records.length}
          onClick={onClear}
        >
          <Trash2 size={14} aria-hidden /> Clear
        </button>
      </div>
      {records.length ? (
        <ol className="schedule-badge-lab-log-list">
          {records.map((record) => (
            <li key={record.key} data-testid="schedule-lab-change">
              <header>
                <strong>{record.targetLabel}</strong>
                <span>
                  {capitalize(record.mode)} /{" "}
                  {stateDefinition(record.state).label}
                </span>
              </header>
              <p>
                {record.propertyLabel}: <del>{record.oldCssValue}</del>{" "}
                <ins>{record.newCssValue}</ins>
              </p>
              <code>{record.semanticSelector || record.selector}</code>
              <small>
                {record.cssProperty} / {record.scope}
              </small>
            </li>
          ))}
        </ol>
      ) : (
        <div className="schedule-badge-lab-log-empty">
          <History size={18} aria-hidden />
          <span>No saved changes</span>
        </div>
      )}
    </div>
  );
}

function LabTargetOverlay({
  kind,
  rect,
}: {
  readonly kind: "hover" | "selected";
  readonly rect: TargetRect;
}) {
  return (
    <div
      className="schedule-badge-lab-target-overlay"
      data-kind={kind}
      aria-hidden="true"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    >
      <span>{rect.label}</span>
    </div>
  );
}

function rectForElement(
  element: HTMLElement | null,
  label: string,
): TargetRect | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    label,
  };
}

function createSnapshotKey(
  mode: LabMode,
  selection: LabSelection,
  state: LabStateId,
): string {
  return [mode, selection.scope, selection.selector, state].join("|");
}

function normalizeControlValue(
  control: LabInspectorControl,
  value: LabControlValue,
): LabControlValue {
  if (control.kind !== "number") return String(value);
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return control.defaultValue;
  const clamped = Math.max(control.min, Math.min(control.max, numeric));
  const precision = decimalPlaces(control.step);
  return Number(clamped.toFixed(precision));
}

function decimalPlaces(value: number): number {
  const decimal = String(value).split(".")[1];
  return decimal?.length ?? 0;
}

function isLabPanelTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(".schedule-badge-lab-panel"))
  );
}

function mirroredStateAttribute(
  state: LabStateId,
): { readonly name: string; readonly value: string } | null {
  const attributes: Partial<
    Record<LabStateId, { name: string; value: string }>
  > = {
    selected: { name: "data-selected", value: "true" },
    focused: { name: "data-focused", value: "true" },
    dragging: { name: "data-dragging", value: "true" },
    dropTarget: { name: "data-drop-target", value: "true" },
    allowed: { name: "data-drop-status", value: "allowed" },
    blocked: { name: "data-drop-status", value: "blocked" },
    active: { name: "data-shift-editor-active-cell", value: "true" },
    closed: { name: "data-closed", value: "true" },
    unavailable: { name: "data-availability-kind", value: "unavailable" },
    overlap: { name: "data-overlap", value: "true" },
    today: { name: "data-today", value: "true" },
    viewed: { name: "data-viewed", value: "true" },
    posts: { name: "data-posts", value: "true" },
    published: { name: "data-status", value: "published" },
    unpublished: { name: "data-status", value: "unpublished" },
    deadline: { name: "data-deadline", value: "true" },
    multiSelected: { name: "data-multi-selected", value: "true" },
    clockOff: { name: "data-preset-clock-off", value: "true" },
    locked: { name: "data-publication-state", value: "locked" },
    stagedRemoved: {
      name: "data-publication-state",
      value: "staged-removed",
    },
    unlockedModified: {
      name: "data-publication-state",
      value: "unlocked-modified",
    },
    copy: { name: "data-copy", value: "true" },
    frozen: { name: "data-unassigned-frozen", value: "true" },
    clickable: { name: "data-clickable", value: "true" },
    comparison: { name: "data-has-comparison", value: "true" },
    stacked: { name: "data-stack-count", value: "2" },
    hasMarkers: { name: "data-has-markers", value: "true" },
  };
  return attributes[state] ?? null;
}

function restoreAttribute(
  element: HTMLElement,
  name: string,
  previousValue: string | null,
) {
  if (previousValue === null) element.removeAttribute(name);
  else element.setAttribute(name, previousValue);
}

function readLabDocument(): LabDocument {
  if (typeof window === "undefined") return { changes: {} };
  try {
    const raw = window.localStorage.getItem(labStorageKey);
    if (!raw) return { changes: {} };
    const parsed = JSON.parse(raw) as {
      readonly schemaVersion?: number;
      readonly changes?: Record<string, LabChangeRecord>;
    };
    return parsed.schemaVersion === 2 && parsed.changes
      ? { changes: parsed.changes }
      : { changes: {} };
  } catch {
    return { changes: {} };
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
