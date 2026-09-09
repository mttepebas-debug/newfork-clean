import { describe, expect, it } from "vitest";

import {
  labInspectorControls,
  labInspectorGroups,
  labStates,
  labTargets,
  targetSelector,
  type LabInspectorControl,
} from "./scheduleShiftBadgeLabCatalog";
import {
  buildInspectorOverrideCss,
  buildLabAiBrief,
  buildLabJsonExport,
  buildSemanticSelector,
  inspectorCssValue,
  readInspectorCssValue,
  resolveLabTarget,
  selectionForCatalogTarget,
  selectionForResolvedTarget,
  type LabChangeRecord,
  type LabControlValue,
} from "./scheduleShiftBadgeLabRuntime";

describe("Schedule Grid lab catalog", () => {
  it("keeps target, property, and state identifiers unique and described", () => {
    expect(new Set(labTargets.map((target) => target.id)).size).toBe(
      labTargets.length,
    );
    expect(
      new Set(labInspectorControls.map((control) => control.id)).size,
    ).toBe(labInspectorControls.length);
    expect(new Set(labStates.map((state) => state.id)).size).toBe(
      labStates.length,
    );

    const groupIds = new Set(labInspectorGroups.map((group) => group.id));
    const stateIds = new Set(labStates.map((state) => state.id));
    for (const target of labTargets) {
      expect(target.label.trim().length).toBeGreaterThan(0);
      expect(target.description.trim().length).toBeGreaterThan(0);
      expect(target.groups.every((group) => groupIds.has(group))).toBe(true);
      expect(target.states.every((state) => stateIds.has(state))).toBe(true);
      expect(() =>
        document.createElement("div").querySelector(target.selector),
      ).not.toThrow();
      expect(() =>
        document
          .createElement("div")
          .querySelector(targetSelector(target, "preview")),
      ).not.toThrow();
      expect(() =>
        document
          .createElement("div")
          .querySelector(targetSelector(target, "edit")),
      ).not.toThrow();
    }

    for (const control of labInspectorControls) {
      expect(control.label.trim().length).toBeGreaterThan(0);
      expect(control.description.trim().length).toBeGreaterThan(0);
      expect(control.cssProperty.trim().length).toBeGreaterThan(0);
      expect(groupIds.has(control.groupId)).toBe(true);
    }
  });

  it("turns every registered property into a concrete CSS effect", () => {
    for (const control of labInspectorControls) {
      const value = changedValue(control);
      const cssValue = inspectorCssValue(control, value);
      expect(cssValue, control.id).not.toBeNull();
      const css = buildInspectorOverrideCss({
        [control.id]: changeFor(control, value, cssValue ?? ""),
      });
      if (
        control.special === "translateX" ||
        control.special === "translateY"
      ) {
        expect(css, control.id).toContain("translate:");
      } else if (control.special?.startsWith("edge")) {
        expect(css, control.id).toContain("background-image:");
      } else {
        expect(css, control.id).toContain(`${control.cssProperty}:`);
      }
    }
  });

  it("resolves the most specific clicked target and builds a stable selector", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="schedule-grid-scroll">
        <div class="schedule-grid-exact" data-testid="schedule-grid">
          <div data-testid="schedule-cell-body" data-editing="false" data-employee-id="e1" data-location-id="l1" data-date="2026-09-03">
            <button class="schedule-shift-badge" data-shift-id="s1">
              <span class="schedule-shift-badge-content"><strong>Server</strong></span>
            </button>
          </div>
        </div>
      </div>`;
    document.body.append(root);
    const title = root.querySelector("strong") as HTMLElement;
    const resolved = resolveLabTarget(title, root);

    expect(resolved?.definition?.id).toBe("badgeTitle");
    expect(buildSemanticSelector(title, root)).toBe(
      '[data-shift-id="s1"] > span.schedule-shift-badge-content > strong',
    );
    const selection = selectionForResolvedTarget({
      resolved: resolved!,
      mode: "preview",
      root,
    });
    expect(selection.scope).toBe("instance");
    expect(selection.selector).toContain('[data-shift-id="s1"]');
    root.remove();
  });

  it("keeps an uncatalogued clicked child as its own editable target", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="schedule-grid-scroll">
        <div class="schedule-cell" data-testid="schedule-cell-body">
          <i data-custom-part="true">custom</i>
        </div>
      </div>`;
    document.body.append(root);
    const custom = root.querySelector("i") as HTMLElement;
    const resolved = resolveLabTarget(custom, root);

    expect(resolved?.definition).toBeNull();
    expect(resolved?.element).toBe(custom);
    expect(
      selectionForResolvedTarget({
        resolved: resolved!,
        mode: "preview",
        root,
      }).semanticSelector,
    ).toContain("i");
    root.remove();
  });

  it("targets pseudo-elements without querying the pseudo node", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="schedule-grid-scroll">
        <button class="schedule-shift-badge" data-shift-id="s1" data-selected="true"></button>
      </div>`;
    document.body.append(root);
    const definition = labTargets.find(
      (target) => target.id === "selectedCheck",
    )!;
    const selection = selectionForCatalogTarget({
      definition,
      mode: "edit",
      root,
    });
    const control = labInspectorControls.find((item) => item.id === "width")!;
    const record = {
      ...changeFor(control, 18, "18px"),
      selector: selection.selector,
      semanticSelector: selection.semanticSelector,
      state: "hover" as const,
    };
    const css = buildInspectorOverrideCss({ [record.key]: record });

    expect(selection.element).toBe(root.querySelector(".schedule-shift-badge"));
    expect(selection.selector).toContain("::after");
    expect(selection.semanticSelector).toBe('[data-shift-id="s1"]::after');
    expect(css).toContain(":hover::after");
    expect(css).toContain('[data-lab-force-state="hover"]::after');
    root.remove();
  });

  it("keeps the exact computed old CSS value for the change log", () => {
    const element = document.createElement("div");
    element.style.borderRightWidth = "3.5px";
    element.style.borderRightStyle = "solid";
    document.body.append(element);
    const control = labInspectorControls.find(
      (item) => item.id === "borderRightWidth",
    )!;

    expect(readInspectorCssValue(control, element)).toBe("3.5px");
    element.remove();
  });

  it("exports an AI brief and structured JSON with exact old/new values", () => {
    const control = labInspectorControls.find(
      (item) => item.id === "fontSize",
    )!;
    const record = changeFor(control, 13.4, "13.4px");
    const changes = { [record.key]: record };

    expect(buildLabAiBrief(changes)).toContain(
      "Font size: 12px -> 13.4px (CSS: font-size)",
    );
    expect(buildLabAiBrief(changes)).toContain("Target: Real shift badge.");
    const exported = JSON.parse(buildLabJsonExport(changes)) as {
      readonly schemaVersion: number;
      readonly changes: LabChangeRecord[];
    };
    expect(exported.schemaVersion).toBe(1);
    expect(exported.changes[0]?.targetLabel).toBe("Shift badge");
    expect(exported.changes[0]?.newCssValue).toBe("13.4px");
  });
});

function changedValue(control: LabInspectorControl): LabControlValue {
  if (control.kind === "number") {
    const candidate = control.defaultValue + control.step;
    return candidate <= control.max
      ? candidate
      : Math.max(control.min, control.defaultValue - control.step);
  }
  if (control.kind === "select") {
    return (
      control.options.find((option) => option.value !== control.defaultValue)
        ?.value ?? control.defaultValue
    );
  }
  if (control.kind === "color") return "#123456";
  return control.cssProperty === "box-shadow"
    ? "0 1px 2px rgb(0 0 0 / 20%)"
    : "none";
}

function changeFor(
  control: LabInspectorControl,
  value: LabControlValue,
  newCssValue: string,
): LabChangeRecord {
  return {
    key: `preview|shiftBadge|base|${control.id}`,
    source: "inspector",
    mode: "preview",
    targetId: "shiftBadge",
    targetLabel: "Shift badge",
    targetDescription: "Real shift badge.",
    selector: '.schedule-shift-badge:not([data-ghost="true"])',
    semanticSelector: '[data-shift-id="shift-1"]',
    scope: "type",
    state: "base",
    propertyId: control.id,
    propertyLabel: control.label,
    propertyDescription: control.description,
    cssProperty: control.cssProperty,
    special: control.special,
    oldValue: control.defaultValue,
    newValue: value,
    oldCssValue:
      inspectorCssValue(control, control.defaultValue) ??
      String(control.defaultValue),
    newCssValue,
    baseline: Object.fromEntries(
      labInspectorControls.map((item) => [item.id, item.defaultValue]),
    ),
    changedAt: "2026-09-03T00:00:00.000Z",
  };
}
