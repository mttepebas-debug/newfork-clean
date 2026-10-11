import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  documentTypeInputSchema,
  type DocumentTypeInput,
} from "@newfork/shared";
import { DocumentSettingsEditor } from "./DocumentSettingsEditor";
import { LifecycleAssignmentFields } from "../documents/DocumentLifecycleFields";
import { getDocumentTargetOptions } from "./documents-data";
import { getPolicyTargetOptions } from "./signature-templates-data";

vi.mock("./documents-data", () => ({
  getDocumentTargetOptions: vi.fn(),
}));
vi.mock("./signature-templates-data", () => ({
  getPolicyTargetOptions: vi.fn(),
  previewPolicyDefinition: vi.fn(),
  applyPolicyDefinition: vi.fn(),
}));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const options = {
  locations: Array.from({ length: 250 }, (_, i) => ({
    id: id(i + 1),
    name: `Location ${i + 1}`,
  })),
  departments: [],
  jobs: [],
  employees: [],
};
const initial = (): DocumentTypeInput => ({
  title: "Safety certificate",
  description: "Current certification",
  required_at_onboarding: false,
  requires_review: true,
  accepted_formats: ["pdf"],
  tracks_expiry: false,
  expiry_warning_days: 30,
  expiry_schedule_impact: "track_only",
  lifecycle_settings: {
    ...defaultDocumentLifecycleSettings,
    mode: "conditional",
    period_days: 7,
    extra_fields: [],
  },
});
const submitted = vi.fn();
function Harness({
  draft = initial(),
  readOnly = false,
}: {
  draft?: DocumentTypeInput;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(draft);
  const parsed = documentTypeInputSchema.safeParse(value);
  return (
    <DocumentSettingsEditor
      value={value}
      onChange={setValue}
      workspaceId={id(100)}
      busy={false}
      readOnly={readOnly}
      saving={false}
      dirty={true}
      issues={parsed.success ? [] : parsed.error.issues}
      error={null}
      onSubmit={(e) => {
        e.preventDefault();
        submitted(value);
      }}
      onClose={() => {}}
      onBusyChange={() => {}}
    />
  );
}
function mount(children = <Harness />) {
  const cache = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>,
  );
}
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
const save = () =>
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocumentTargetOptions).mockResolvedValue(options);
  vi.mocked(getPolicyTargetOptions).mockResolvedValue(options);
});

describe("Document guided editor", () => {
  it("retains searched selections across steps, never saves early, and preserves legacy formats", async () => {
    mount();
    expect(
      screen.queryByRole("tablist", { name: "Document sections" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByLabelText("Match groups")).toBeNull();
    expect(screen.queryByLabelText("Assignment scope")).toBeNull();
    expect(
      screen.queryByText("Named people", { selector: "summary" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Updated certificate" },
    });
    const summary = await screen.findByText("All Locations", {
      selector: "summary",
    });
    fireEvent.click(summary);
    fireEvent.click(screen.getByLabelText("Location 1"));
    fireEvent.change(screen.getByLabelText("Search locations"), {
      target: { value: "Location 250" },
    });
    fireEvent.click(screen.getByLabelText("Location 250"));
    expect(screen.queryByRole("button", { name: "Next targets" })).toBeNull();
    next();
    expect(submitted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Updated certificate",
    );
    fireEvent.click(screen.getByText("2 locations", { selector: "summary" }));
    expect(
      screen.getByLabelText("Location 250").getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.change(screen.getByLabelText("Search locations"), {
      target: { value: "Location 1" },
    });
    expect(
      screen.getByLabelText("Location 1").getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByLabelText("Search locations"), {
      key: "Escape",
    });
    expect(document.activeElement?.tagName).toBe("SUMMARY");
    next();
    save();
    expect(submitted).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Updated certificate",
        accepted_formats: ["pdf"],
        lifecycle_settings: expect.objectContaining({
          target: expect.objectContaining({ location_ids: [id(1), id(250)] }),
        }),
      }),
    );
    expect(getDocumentTargetOptions).toHaveBeenCalledTimes(1);
  });
  // BL-857: Step 2 names the formats as the list does, and pages fields only
  // when there is more than one page of them.
  it("names formats as the list does and pages fields only when they overflow", () => {
    const draft = initial();
    draft.accepted_formats = ["webp", "pdf"];
    mount(<Harness draft={draft} />);
    next();
    expect(screen.getByText("Accepted uploads: PDF, WebP")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Next fields" })).toBeNull();
    for (let i = 0; i < 3; i += 1)
      fireEvent.click(screen.getByRole("button", { name: /Add field/ }));
    expect(screen.getByRole("button", { name: "Next fields" })).toBeTruthy();
  });

  it("uses Schedule All semantics for each group and applies intersection on filter edits", async () => {
    vi.mocked(getDocumentTargetOptions).mockResolvedValue({
      ...options,
      locations: options.locations.slice(0, 2),
      departments: [
        { id: id(301), name: "Kitchen" },
        { id: id(302), name: "Service" },
      ],
      jobs: [
        { id: id(401), name: "Cook", department_id: id(301) },
        { id: id(402), name: "Host", department_id: id(302) },
      ],
    });
    const draft = initial();
    draft.lifecycle_settings!.target = {
      ...draft.lifecycle_settings!.target,
      operator: "or",
    };
    mount(<Harness draft={draft} />);
    await screen.findByText("All Locations", { selector: "summary" });
    for (const [label, first, second] of [
      ["Locations", "Location 1", "Location 2"],
      ["Departments", "Kitchen", "Service"],
      ["Jobs", "Cook", "Host"],
    ] as const) {
      fireEvent.click(
        screen.getByText(`All ${label}`, { selector: "summary" }),
      );
      const all = screen.getByRole("checkbox", { name: `All ${label}` });
      expect(all.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(screen.getByRole("checkbox", { name: first }));
      expect(all.getAttribute("aria-checked")).toBe("false");
      expect(
        screen
          .getByRole("checkbox", { name: second })
          .getAttribute("aria-checked"),
      ).toBe("false");
      fireEvent.click(screen.getByRole("checkbox", { name: second }));
      expect(all.getAttribute("aria-checked")).toBe("true");
      fireEvent.click(screen.getByRole("checkbox", { name: first }));
      fireEvent.change(screen.getByLabelText(`Search ${label.toLowerCase()}`), {
        target: { value: first },
      });
      fireEvent.click(all);
      fireEvent.change(screen.getByLabelText(`Search ${label.toLowerCase()}`), {
        target: { value: "" },
      });
      expect(
        screen
          .getByRole("checkbox", { name: second })
          .getAttribute("aria-checked"),
      ).toBe("true");
    }
    next();
    save();
    expect(submitted.mock.calls[0]![0].lifecycle_settings.target).toEqual({
      operator: "and",
      location_ids: [],
      department_ids: [],
      job_ids: [],
      employee_ids: [],
    });
  });
  it("validates each step and routes hidden final errors without an early save", async () => {
    const draft = initial();
    draft.lifecycle_settings!.extra_fields = Array.from(
      { length: 6 },
      (_, i) => ({
        key: `field_${i}`,
        label: i === 4 ? "" : `Field ${i + 1}`,
        kind: "text",
        required: false,
      }),
    );
    mount(<Harness draft={draft} />);
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.submit(screen.getByRole("form"));
    expect(submitted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.submit(screen.getByRole("form"));
    await waitFor(() =>
      expect(document.activeElement).toHaveProperty("value", ""),
    );
    const labels = screen.getAllByLabelText("Field label");
    expect(labels).toHaveLength(2);
    expect(labels[0]).toBe(document.activeElement);
    fireEvent.change(labels[0]!, { target: { value: "Corrected" } });
    save();
    expect(
      submitted.mock.calls[0]![0].lifecycle_settings.extra_fields,
    ).toHaveLength(6);
  });
  it("prevents Next for invalid Details and focuses invalid numeric rules on submit", () => {
    const draft = initial();
    draft.lifecycle_settings!.period_days = 0;
    mount(<Harness draft={draft} />);
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.submit(screen.getByRole("form"));
    expect(screen.getByLabelText("Grace period (days)")).toBe(
      document.activeElement,
    );
    fireEvent.change(screen.getByLabelText("Requirement"), {
      target: { value: "optional" },
    });
    expect(screen.queryByLabelText("Grace period (days)")).toBeNull();
    fireEvent.click(screen.getByLabelText("Track expiration"));
    fireEvent.change(screen.getByLabelText("Warn before expiry (days)"), {
      target: { value: "366" },
    });
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.change(screen.getByLabelText("Warn before expiry (days)"), {
      target: { value: "30" },
    });
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      false,
    );
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );
  });
  it("retains the default acknowledgement fieldset and payload behavior", async () => {
    const changed = vi.fn();
    mount(
      <LifecycleAssignmentFields
        workspaceId={id(100)}
        kind="acknowledgement"
        settings={defaultDocumentLifecycleSettings}
        onChange={changed}
      />,
    );
    await waitFor(() => expect(getPolicyTargetOptions).toHaveBeenCalledOnce());
    const audience = screen.getByRole("group", { name: "Who needs it" });
    expect(within(audience).getByLabelText("Assignment scope")).toBeTruthy();
    expect(screen.queryByRole("tablist", { name: "Target groups" })).toBeNull();
    expect(screen.queryByRole("option", { name: "Conditional" })).toBeNull();
    expect(screen.queryByText("Additional fields")).toBeNull();
    fireEvent.change(screen.getByLabelText("Requirement"), {
      target: { value: "required" },
    });
    expect(changed).toHaveBeenCalledWith({
      ...defaultDocumentLifecycleSettings,
      mode: "required",
    });
  });

  it("opens read-only for a published document without a save path", () => {
    mount(<Harness readOnly />);
    expect(screen.getByText("Published - unpublish to edit")).toBeTruthy();
    expect(screen.getByLabelText("Name").matches(":disabled")).toBe(true);
    next();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(submitted).not.toHaveBeenCalled();
  });
});
