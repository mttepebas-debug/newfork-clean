import {
  appendStateSelector,
  labInspectorControls,
  labTargets,
  targetElementSelector,
  targetSelector,
  type LabInspectorControl,
  type LabMode,
  type LabPseudoElement,
  type LabStateId,
  type LabTargetDefinition,
} from "./scheduleShiftBadgeLabCatalog";

export type LabControlValue = number | string;
export type LabTargetScope = "type" | "instance";

export interface LabSelection {
  readonly targetId: string;
  readonly targetLabel: string;
  readonly targetDescription: string;
  readonly definition: LabTargetDefinition | null;
  readonly element: HTMLElement | null;
  readonly selector: string;
  readonly semanticSelector: string;
  readonly scope: LabTargetScope;
  readonly pseudoElement?: LabPseudoElement;
}

export interface LabChangeRecord {
  readonly key: string;
  readonly source: "quick" | "inspector";
  readonly mode: LabMode;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly targetDescription: string;
  readonly selector: string;
  readonly semanticSelector: string;
  readonly scope: LabTargetScope | "global";
  readonly state: LabStateId;
  readonly propertyId: string;
  readonly propertyLabel: string;
  readonly propertyDescription: string;
  readonly cssProperty: string;
  readonly special?: LabInspectorControl["special"];
  readonly oldValue: LabControlValue;
  readonly newValue: LabControlValue;
  readonly oldCssValue: string;
  readonly newCssValue: string;
  readonly baseline?: Readonly<Record<string, LabControlValue>>;
  readonly changedAt: string;
}

export interface ResolvedLabTarget {
  readonly definition: LabTargetDefinition | null;
  readonly element: HTMLElement;
}

const unsafeCssValuePattern = /[;{}<>]|url\s*\(|expression\s*\(/i;

export function resolveLabTarget(
  start: EventTarget | null,
  root: HTMLElement,
): ResolvedLabTarget | null {
  if (!(start instanceof Element)) return null;
  if (start.closest(".schedule-badge-lab-panel")) return null;
  const grid = start.closest(".schedule-grid-scroll");
  if (!grid || !root.contains(grid)) return null;

  const fallback = start instanceof HTMLElement ? start : start.parentElement;
  if (!fallback || !root.contains(fallback)) return null;

  for (const definition of labTargets) {
    if (definition.pseudoElement) continue;
    if (fallback.matches(definition.selector)) {
      return { definition, element: fallback };
    }
  }

  const svg = start instanceof SVGElement ? start.closest("svg") : null;
  if (svg) {
    for (const definition of labTargets) {
      if (definition.pseudoElement) continue;
      if (svg.matches(definition.selector) && svg.parentElement) {
        return { definition, element: svg.parentElement };
      }
    }
  }

  return { definition: null, element: fallback };
}

export function selectionForResolvedTarget({
  resolved,
  mode,
  root,
  scope = "instance",
}: {
  readonly resolved: ResolvedLabTarget;
  readonly mode: LabMode;
  readonly root: HTMLElement;
  readonly scope?: LabTargetScope;
}): LabSelection {
  const { definition, element } = resolved;
  const semanticSelector = buildSemanticSelector(element, root);
  const selector =
    scope === "type" && definition
      ? targetSelector(definition, mode)
      : semanticSelector;
  return {
    targetId: definition?.id ?? `custom:${semanticSelector}`,
    targetLabel: definition?.label ?? describeFallbackElement(element),
    targetDescription:
      definition?.description ??
      "Custom DOM element selected directly from the Schedule Grid.",
    definition,
    element,
    selector,
    semanticSelector,
    scope,
    pseudoElement: definition?.pseudoElement,
  };
}

export function selectionForCatalogTarget({
  definition,
  mode,
  root,
}: {
  readonly definition: LabTargetDefinition;
  readonly mode: LabMode;
  readonly root: HTMLElement;
}): LabSelection {
  const elementSelector = targetElementSelector(definition, mode);
  const selector = targetSelector(definition, mode);
  const element = root.querySelector<HTMLElement>(elementSelector);
  const semanticElementSelector = element
    ? buildSemanticSelector(element, root)
    : elementSelector;
  const semanticSelector = definition.pseudoElement
    ? appendPseudoElement(semanticElementSelector, definition.pseudoElement)
    : semanticElementSelector;
  return {
    targetId: definition.id,
    targetLabel: definition.label,
    targetDescription: definition.description,
    definition,
    element,
    selector,
    semanticSelector,
    scope: "type",
    pseudoElement: definition.pseudoElement,
  };
}

export function withSelectionScope(
  selection: LabSelection,
  mode: LabMode,
  scope: LabTargetScope,
): LabSelection {
  return {
    ...selection,
    scope,
    selector:
      scope === "type" && selection.definition
        ? targetSelector(selection.definition, mode)
        : selection.semanticSelector,
  };
}

export function modeFromElement(
  element: HTMLElement,
  fallback: LabMode,
): LabMode {
  const modeOwner = element.closest<HTMLElement>("[data-editing]");
  const editing = modeOwner?.dataset.editing;
  return editing === "true"
    ? "edit"
    : editing === "false"
      ? "preview"
      : fallback;
}

export function snapshotInspectorValues(
  element: HTMLElement | null,
  pseudoElement?: LabPseudoElement,
): Record<string, LabControlValue> {
  return Object.fromEntries(
    labInspectorControls.map((control) => [
      control.id,
      readInspectorValue(control, element, pseudoElement),
    ]),
  );
}

export function snapshotInspectorCssValues(
  element: HTMLElement | null,
  pseudoElement?: LabPseudoElement,
): Record<string, string> {
  return Object.fromEntries(
    labInspectorControls.map((control) => [
      control.id,
      readInspectorCssValue(control, element, pseudoElement),
    ]),
  );
}

export function readInspectorValue(
  control: LabInspectorControl,
  element: HTMLElement | null,
  pseudoElement?: LabPseudoElement,
): LabControlValue {
  if (!element || typeof window === "undefined") return control.defaultValue;
  if (control.special === "translateX" || control.special === "translateY") {
    return 0;
  }
  if (control.id === "scale") return 1;
  if (control.id === "rotate") return 0;

  if (
    !pseudoElement &&
    control.kind === "number" &&
    control.readAs === "rectWidth"
  ) {
    return roundDecimal(
      element.getBoundingClientRect().width || element.offsetWidth,
    );
  }
  if (
    !pseudoElement &&
    control.kind === "number" &&
    control.readAs === "rectHeight"
  ) {
    return roundDecimal(
      element.getBoundingClientRect().height || element.offsetHeight,
    );
  }

  const style = window.getComputedStyle(element, pseudoElement);
  const raw = style
    .getPropertyValue(control.computedProperty ?? control.cssProperty)
    .trim();

  if (control.kind === "number") {
    if (control.readAs === "milliseconds") {
      return parseMilliseconds(raw, control.defaultValue);
    }
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed)
      ? roundDecimal(parsed)
      : control.defaultValue;
  }
  if (control.kind === "color") {
    return cssColorToHex(raw, control.defaultValue);
  }
  if (control.kind === "select") {
    return control.options.some((option) => option.value === raw)
      ? raw
      : control.defaultValue;
  }
  return sanitizeCssValue(raw) ?? control.defaultValue;
}

export function readInspectorCssValue(
  control: LabInspectorControl,
  element: HTMLElement | null,
  pseudoElement?: LabPseudoElement,
): string {
  const fallback =
    inspectorCssValue(control, control.defaultValue) ??
    String(control.defaultValue);
  if (!element || typeof window === "undefined") return fallback;
  if (control.special === "translateX" || control.special === "translateY") {
    return "0px";
  }
  if (control.id === "scale") {
    return window.getComputedStyle(element, pseudoElement).scale || "none";
  }
  if (control.id === "rotate") {
    return window.getComputedStyle(element, pseudoElement).rotate || "none";
  }
  if (
    !pseudoElement &&
    control.kind === "number" &&
    control.readAs === "rectWidth"
  ) {
    return `${roundDecimal(element.getBoundingClientRect().width || element.offsetWidth)}px`;
  }
  if (
    !pseudoElement &&
    control.kind === "number" &&
    control.readAs === "rectHeight"
  ) {
    return `${roundDecimal(element.getBoundingClientRect().height || element.offsetHeight)}px`;
  }
  return (
    window
      .getComputedStyle(element, pseudoElement)
      .getPropertyValue(control.computedProperty ?? control.cssProperty)
      .trim() || fallback
  );
}

export function inspectorCssValue(
  control: LabInspectorControl,
  value: LabControlValue,
): string | null {
  if (control.kind === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) return null;
    const safe = Math.max(control.min, Math.min(control.max, numeric));
    return `${roundDecimal(safe)}${control.unit}`;
  }

  const raw = String(value).trim();
  if (control.kind === "select") {
    return control.options.some((option) => option.value === raw) ? raw : null;
  }
  if (control.kind === "color") {
    return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : null;
  }
  return sanitizeCssValue(raw);
}

export function inspectorChangeKey({
  mode,
  selection,
  state,
  propertyId,
}: {
  readonly mode: LabMode;
  readonly selection: LabSelection;
  readonly state: LabStateId;
  readonly propertyId: string;
}): string {
  return [
    "inspector",
    mode,
    selection.scope,
    selection.selector,
    state,
    propertyId,
  ].join("|");
}

export function buildInspectorOverrideCss(
  changes: Readonly<Record<string, LabChangeRecord>>,
): string {
  const groups = new Map<string, LabChangeRecord[]>();
  for (const record of Object.values(changes)) {
    if (record.source !== "inspector") continue;
    const key = [record.mode, record.selector, record.state].join("|");
    const records = groups.get(key) ?? [];
    records.push(record);
    groups.set(key, records);
  }

  const rules: string[] = [];
  for (const records of groups.values()) {
    const first = records[0];
    if (!first) continue;
    const prefix = `.schedule-badge-lab-clone[data-lab-mode="${first.mode}"]`;
    const stateSelector = appendStateSelector(first.selector, first.state);
    const selectors = prefixSelectorList(prefix, stateSelector);
    const forcedSelectors =
      first.state === "base"
        ? []
        : prefixSelectorList(
            prefix,
            appendAttributeToSelector(
              first.selector,
              `[data-lab-force-state="${first.state}"]`,
            ),
          );
    const declarations = buildDeclarations(records);
    if (!declarations.length) continue;
    rules.push(
      `${[...selectors, ...forcedSelectors].join(",\n")} {\n${declarations
        .map((declaration) => `  ${declaration}`)
        .join("\n")}\n}`,
    );
  }
  return rules.join("\n\n");
}

export function buildLabAiBrief(
  changes: Readonly<Record<string, LabChangeRecord>>,
): string {
  const records = Object.values(changes).sort(compareChanges);
  if (!records.length) return "Schedule Grid Lab: no saved changes.";

  const lines = [
    "Schedule Grid Lab change request",
    "Apply only the listed visual changes. Preserve existing Schedule behavior and interaction contracts.",
    "",
  ];
  let previousHeading = "";
  for (const record of records) {
    const heading = `${capitalize(record.mode)} / ${record.targetLabel} / ${stateLabel(record.state)} / ${record.scope}`;
    if (heading !== previousHeading) {
      if (previousHeading) lines.push("");
      lines.push(heading);
      lines.push(`Target: ${record.targetDescription}`);
      lines.push(`Selector: ${record.semanticSelector || record.selector}`);
      previousHeading = heading;
    }
    lines.push(
      `- ${record.propertyLabel}: ${record.oldCssValue} -> ${record.newCssValue} (CSS: ${record.cssProperty})`,
    );
  }
  return lines.join("\n");
}

export function buildLabJsonExport(
  changes: Readonly<Record<string, LabChangeRecord>>,
): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      surface: "schedule-grid-lab",
      changes: Object.values(changes).sort(compareChanges),
    },
    null,
    2,
  );
}

export function buildSemanticSelector(
  element: HTMLElement,
  root: HTMLElement,
): string {
  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== root) {
    const stable = stableAnchorSelector(current);
    if (stable) {
      parts.unshift(stable);
      break;
    }
    parts.unshift(elementSegment(current));
    current = current.parentElement;
  }
  return parts.join(" > ") || elementSegment(element);
}

function buildDeclarations(records: readonly LabChangeRecord[]): string[] {
  const declarations: string[] = [];
  const ordinary = records.filter((record) => !record.special);
  for (const record of ordinary) {
    const value = sanitizeCssValue(record.newCssValue);
    if (!value) continue;
    declarations.push(`${record.cssProperty}: ${value} !important;`);
  }

  const x = records.find((record) => record.special === "translateX");
  const y = records.find((record) => record.special === "translateY");
  if (x || y) {
    declarations.push(
      `translate: ${x?.newCssValue ?? "0px"} ${y?.newCssValue ?? "0px"} !important;`,
    );
  }

  const edgeRecords = records.filter((record) =>
    record.special?.startsWith("edge"),
  );
  if (edgeRecords.length)
    declarations.push(...buildEdgeDeclarations(records, edgeRecords));
  return declarations;
}

function buildEdgeDeclarations(
  records: readonly LabChangeRecord[],
  edgeRecords: readonly LabChangeRecord[],
): string[] {
  const baseline = edgeRecords[0]?.baseline ?? {};
  const layers: string[] = [];
  const sizes: string[] = [];
  const positions: string[] = [];
  const repeats: string[] = [];
  const declarations: string[] = [];

  const addEdge = (
    special: NonNullable<LabChangeRecord["special"]>,
    side: "Top" | "Right" | "Bottom" | "Left",
  ) => {
    const offsetRecord = edgeRecords.find(
      (record) => record.special === special,
    );
    if (!offsetRecord) return;
    const width = currentControlCssValue(
      records,
      baseline,
      `border${side}Width`,
      "1px",
    );
    const color = currentControlCssValue(
      records,
      baseline,
      `border${side}Color`,
      "#c9d3cd",
    );
    const offset = offsetRecord.newCssValue;
    layers.push(`linear-gradient(${color}, ${color})`);
    repeats.push("no-repeat");
    if (side === "Top" || side === "Bottom") {
      sizes.push(`100% ${width}`);
      positions.push(
        side === "Top" ? `left 0 top ${offset}` : `left 0 bottom ${offset}`,
      );
    } else {
      sizes.push(`${width} 100%`);
      positions.push(
        side === "Right" ? `right ${offset} top 0` : `left ${offset} top 0`,
      );
    }
    declarations.push(`border-${side.toLowerCase()}-width: 0 !important;`);
  };

  addEdge("edgeTopOffset", "Top");
  addEdge("edgeRightOffset", "Right");
  addEdge("edgeBottomOffset", "Bottom");
  addEdge("edgeLeftOffset", "Left");

  const underlyingImage = currentControlCssValue(
    records,
    baseline,
    "backgroundImage",
    "none",
  );
  if (underlyingImage !== "none") {
    layers.push(underlyingImage);
    sizes.push(
      currentControlCssValue(records, baseline, "backgroundSize", "auto"),
    );
    positions.push(
      currentControlCssValue(records, baseline, "backgroundPosition", "0% 0%"),
    );
    repeats.push(
      currentControlCssValue(records, baseline, "backgroundRepeat", "repeat"),
    );
  }

  if (layers.length) {
    declarations.push(`background-image: ${layers.join(", ")} !important;`);
    declarations.push(`background-size: ${sizes.join(", ")} !important;`);
    declarations.push(
      `background-position: ${positions.join(", ")} !important;`,
    );
    declarations.push(`background-repeat: ${repeats.join(", ")} !important;`);
  }
  return declarations;
}

function currentControlCssValue(
  records: readonly LabChangeRecord[],
  baseline: Readonly<Record<string, LabControlValue>>,
  propertyId: string,
  fallback: string,
): string {
  const record = records.find((item) => item.propertyId === propertyId);
  if (record) return record.newCssValue;
  const control = labInspectorControls.find((item) => item.id === propertyId);
  if (!control) return fallback;
  return (
    inspectorCssValue(control, baseline[propertyId] ?? control.defaultValue) ??
    fallback
  );
}

function prefixSelectorList(prefix: string, selector: string): string[] {
  return selector
    .split(",")
    .map((part) => `${prefix} ${part.trim()}`)
    .filter(Boolean);
}

function appendAttributeToSelector(
  selector: string,
  attribute: string,
): string {
  return selector
    .split(",")
    .map((part) => appendBeforePseudoElement(part.trim(), attribute))
    .join(", ");
}

function appendPseudoElement(
  selector: string,
  pseudoElement: LabPseudoElement,
): string {
  return selector
    .split(",")
    .map((part) => `${part.trim()}${pseudoElement}`)
    .join(", ");
}

function appendBeforePseudoElement(selector: string, suffix: string): string {
  const pseudoIndex = selector.indexOf("::");
  return pseudoIndex < 0
    ? `${selector}${suffix}`
    : `${selector.slice(0, pseudoIndex)}${suffix}${selector.slice(pseudoIndex)}`;
}

function stableAnchorSelector(element: HTMLElement): string | null {
  if (element.dataset.shiftId) {
    return `[data-shift-id="${escapeAttribute(element.dataset.shiftId)}"]`;
  }
  if (element.dataset.testid === "schedule-cell-body") {
    const attributes = [
      '[data-testid="schedule-cell-body"]',
      element.dataset.employeeId !== undefined
        ? `[data-employee-id="${escapeAttribute(element.dataset.employeeId)}"]`
        : "",
      element.dataset.locationId
        ? `[data-location-id="${escapeAttribute(element.dataset.locationId)}"]`
        : "",
      element.dataset.date
        ? `[data-date="${escapeAttribute(element.dataset.date)}"]`
        : "",
    ];
    return attributes.join("");
  }
  if (element.dataset.scheduleEmployeeRow) {
    return `[data-schedule-employee-row="${escapeAttribute(element.dataset.scheduleEmployeeRow)}"]`;
  }
  if (element.dataset.scheduleEmployeeGroup) {
    return `[data-schedule-employee-group="${escapeAttribute(element.dataset.scheduleEmployeeGroup)}"]`;
  }
  if (element.id?.startsWith("schedule-")) {
    return `#${escapeIdentifier(element.id)}`;
  }
  if (element.dataset.testid === "schedule-grid") {
    return '[data-testid="schedule-grid"]';
  }
  return null;
}

function elementSegment(element: HTMLElement): string {
  const classes = [...element.classList]
    .filter((name) => name.startsWith("schedule-"))
    .slice(0, 2)
    .map((name) => `.${escapeIdentifier(name)}`)
    .join("");
  let segment = `${element.tagName.toLowerCase()}${classes}`;
  const parent = element.parentElement;
  if (parent) {
    const sameTag = [...parent.children].filter(
      (child) => child.tagName === element.tagName,
    );
    if (sameTag.length > 1) {
      segment += `:nth-of-type(${sameTag.indexOf(element) + 1})`;
    }
  }
  return segment;
}

function describeFallbackElement(element: HTMLElement): string {
  const className = [...element.classList].find((name) =>
    name.startsWith("schedule-"),
  );
  return className
    ? className.replace(/^schedule-/, "").replaceAll("-", " ")
    : element.tagName.toLowerCase();
}

function sanitizeCssValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || unsafeCssValuePattern.test(trimmed)) return null;
  return trimmed;
}

function cssColorToHex(value: string, fallback: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (
    !channels ||
    channels.length < 3 ||
    channels.some((item) => !Number.isFinite(item))
  ) {
    return fallback;
  }
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function parseMilliseconds(value: string, fallback: number): number {
  const first = value.split(",")[0]?.trim() ?? "";
  const numeric = Number.parseFloat(first);
  if (!Number.isFinite(numeric)) return fallback;
  return roundDecimal(first.endsWith("ms") ? numeric : numeric * 1000);
}

function compareChanges(left: LabChangeRecord, right: LabChangeRecord): number {
  return [left.mode, left.targetLabel, left.state, left.propertyLabel]
    .join("|")
    .localeCompare(
      [right.mode, right.targetLabel, right.state, right.propertyLabel].join(
        "|",
      ),
    );
}

function stateLabel(stateId: LabStateId): string {
  return stateId === "base"
    ? "Base"
    : stateId
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeAttribute(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

function roundDecimal(value: number): number {
  return Math.round(value * 1000) / 1000;
}
