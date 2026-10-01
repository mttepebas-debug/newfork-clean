// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyWeeklyPreference,
  weeklyPreferenceReadSchema,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { WeeklyPreferencesForm } from "./WeeklyPreferencesForm";

afterEach(cleanup);
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
const typeId = "ab920000-0000-4000-8000-000000000001";
function model(
  mode: "shift_type" | "time_range" = "shift_type",
): WeeklyPreferenceRead {
  return {
    employee_id: "ab910000-0000-4000-8000-000000000001",
    employee_name: "Ada Lovelace",
    can_edit_employee: true,
    can_manage: true,
    time_format: "24h",
    settings: {
      input_mode: mode,
      onboarding_required: false,
      revision: 3,
    },
    employee: {
      revision: 2,
      submitted: true,
      updated_at: null,
      preference: emptyWeeklyPreference(mode),
    },
    manager: {
      revision: 4,
      submitted: true,
      updated_at: null,
      preference: emptyWeeklyPreference(mode),
      enabled: true,
      notes: ["", "Keep this note", "", "", "", "", ""],
    },
    shift_types: [
      {
        id: typeId,
        name: "Dinner",
        start_time: "17:00",
        end_time: "23:00",
        archived: false,
        selectable: true,
      },
    ],
  };
}
function setup(data = model(), audience: "employee" | "manager" = "manager") {
  const onSave = vi.fn(async (command: WeeklyPreferenceSave) => {
    const next = structuredClone(data);
    const record =
      command.source === "employee" ? next.employee : next.manager!;
    record.preference = command.preference;
    record.revision += 1;
    record.submitted = true;
    if (command.source === "manager") {
      next.manager!.enabled = command.enabled!;
      next.manager!.notes = command.notes!;
    }
    return next;
  });
  const result = render(
    <WeeklyPreferencesForm model={data} audience={audience} onSave={onSave} />,
  );
  if (audience === "manager")
    fireEvent.click(screen.getByRole("tab", { name: "Manager reminders" }));
  return { ...result, onSave };
}

describe("weekly preference form", () => {
  it("requires a separate keep/cancel choice for every pending request before saving", async () => {
    const data = model();
    const item = {
      kind: "exchange_application" as const,
      id: "ab930000-0000-4000-8000-000000000001",
      fingerprint: "a".repeat(64),
      request_revision: "1",
      request_type: "open_pickup" as const,
      location_name: "Downtown",
      date: "2035-01-15",
      start_time: "17:00",
      end_time: "23:00",
      timezone: "UTC",
      intervals: [],
    };
    const onPreview = vi
      .fn()
      .mockResolvedValue({
        items: [
          item,
          {
            ...item,
            id: "ab930000-0000-4000-8000-000000000002",
            request_type: "cover",
          },
        ],
      });
    const onSave = vi.fn().mockResolvedValue(data);
    render(
      <WeeklyPreferencesForm
        model={data}
        audience="employee"
        onPreview={onPreview}
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("dialog", { name: "Review pending requests" });
    expect(onSave).not.toHaveBeenCalled();
    expect(
      (
        screen.getByRole("button", {
          name: "Save availability",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Shift pickup" })).getByRole(
        "radio",
        { name: "Keep request" },
      ),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Save availability",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Cover request" })).getByRole(
        "radio",
        { name: "Cancel request" },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]![0].decisions).toEqual([
      {
        kind: item.kind,
        id: item.id,
        fingerprint: item.fingerprint,
        action: "keep",
      },
      {
        kind: item.kind,
        id: "ab930000-0000-4000-8000-000000000002",
        fingerprint: item.fingerprint,
        action: "cancel",
      },
    ]);
  });
  it("removes private draft notes when manager access disappears", () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    expect(screen.getByText("Keep this note")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    rerender(
      <WeeklyPreferencesForm
        model={{ ...data, can_manage: false, manager: null }}
        audience="manager"
        onSave={onSave}
      />,
    );
    expect(screen.queryByText("Keep this note")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("draws no reminder section when the model carries no manager record", () => {
    render(
      <WeeklyPreferencesForm
        model={{ ...model(), manager: null }}
        audience="manager"
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/manager reminders/i)).toBeNull();
    expect(screen.queryByText(/not available/i)).toBeNull();
    expect(
      screen.queryByRole("switch", { name: "Enable manager reminders" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Employee availability" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("draws no reminder section when the read leaves the manager field out (manager+ target)", () => {
    // The read omits `manager` when the person is a manager, admin or owner.
    const { manager: _omitted, ...wire } = model();
    const parsed = weeklyPreferenceReadSchema.parse(wire);
    expect("manager" in parsed).toBe(false);
    render(
      <WeeklyPreferencesForm model={parsed} audience="manager" onSave={vi.fn()} />,
    );
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/manager reminders/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("offers the reminder tab when the model carries a manager record", () => {
    render(
      <WeeklyPreferencesForm model={model()} audience="manager" onSave={vi.fn()} />,
    );
    expect(screen.getByRole("tab", { name: "Manager reminders" })).toBeTruthy();
  });

  it("tells the employee in one sentence that availability is a preference (BL-186)", () => {
    const view = render(
      <WeeklyPreferencesForm model={model()} audience="employee" onSave={vi.fn()} />,
    );
    const text = (view.container.querySelector(".weekly-preferences-explainer")?.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(text).toBe("Availability is a preference, not a guarantee: a manager can still schedule you when you've marked yourself unavailable.");
    view.unmount();
    const onboarding = render(
      <WeeklyPreferencesForm model={model()} audience="employee" onSave={vi.fn()} wizard />,
    );
    expect(onboarding.container.querySelector(".weekly-preferences-explainer")).toBeNull();
    onboarding.unmount();
    render(<WeeklyPreferencesForm model={model()} audience="manager" onSave={vi.fn()} />);
    expect(document.querySelector(".weekly-preferences-explainer")).toBeNull();
  });

  it("can submit a completely available week without making artificial edits", async () => {
    const data = model();
    data.employee.submitted = false;
    data.employee.revision = 0;
    const { onSave } = setup(data, "employee");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference).toEqual(
      emptyWeeklyPreference("shift_type"),
    );
    await screen.findByText("Saved");
    expect(screen.getByText("Submitted")).toBeTruthy();
  });

  it("copies the employee week exactly, replacing selections but keeping notes", async () => {
    const data = model();
    data.employee.preference.days[2]!.all_day = true;
    data.manager!.preference.days[1]!.shift_type_ids = [typeId];
    const { onSave } = setup(data);
    fireEvent.click(
      screen.getByRole("button", { name: "Use employee preferences" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Monday Dinner unavailable" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      (
        screen.getByRole("switch", {
          name: "Tuesday all day unavailable",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      preference: data.employee.preference,
      copy_employee_revision: data.employee.revision,
      notes: data.manager!.notes,
      expected_revision: 4,
      settings_revision: 3,
    });
    await screen.findByText("Saved");
    expect(
      (
        screen.getByRole("switch", {
          name: "Tuesday all day unavailable",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it("keeps reminders while off and saves the toggle with the draft", async () => {
    const data = model();
    data.manager!.preference.days[1]!.shift_type_ids = [typeId];
    const { onSave } = setup(data);
    fireEvent.click(
      screen.getByRole("switch", { name: "Enable manager reminders" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Use employee preferences",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Monday Dinner unavailable",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Edit Monday manager note",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      enabled: false,
      preference: data.manager!.preference,
      notes: data.manager!.notes,
    });
  });

  it("disables copying never-submitted preferences, but copies a submitted empty week", () => {
    const data = model();
    data.employee.submitted = false;
    const { rerender, onSave } = setup(data);
    expect(
      (
        screen.getByRole("button", {
          name: "Use employee preferences",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    data.employee.submitted = true;
    rerender(
      <WeeklyPreferencesForm
        model={{ ...data }}
        audience="manager"
        onSave={onSave}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Use employee preferences",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("all day disables detail and switching off leaves the day available", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Monday all day unavailable" }),
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Monday Dinner unavailable",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(
      screen.getByRole("switch", { name: "Monday all day unavailable" }),
    );
    expect(
      screen
        .getByRole("button", { name: "Monday Dinner unavailable" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("discards a reminder draft when moving between the two tabs", () => {
    setup();
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "Employee availability" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.keyDown(
      screen.getByRole("tab", { name: "Employee availability" }),
      { key: "ArrowRight" },
    );
    expect(
      screen
        .getByRole("button", { name: "Monday Dinner unavailable" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("never carries a draft into another employee drawer", () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    rerender(
      <WeeklyPreferencesForm
        model={{ ...data, employee_id: "ab910000-0000-4000-8000-000000000002" }}
        audience="manager"
        onSave={onSave}
      />,
    );
    expect(
      screen
        .getByRole("tab", { name: "Employee availability" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "Manager reminders" }));
    expect(
      screen
        .getByRole("button", { name: "Monday Dinner unavailable" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("retains a dirty draft and its original revision on a live model refresh", async () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    const refreshed = structuredClone(data);
    refreshed.manager!.revision = 5;
    rerender(
      <WeeklyPreferencesForm
        model={refreshed}
        audience="manager"
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].expected_revision).toBe(4);
  });

  it("retains the draft when saving fails and prevents parallel saves", async () => {
    let fail!: (error: Error) => void;
    const onSave = vi.fn(
      () =>
        new Promise<WeeklyPreferenceRead>((_resolve, reject) => {
          fail = reject;
        }),
    );
    render(
      <WeeklyPreferencesForm
        model={model()}
        audience="employee"
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Monday Dinner unavailable" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => {
      fail(new Error("Another manager saved changes. Reload before saving."));
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Reload before saving",
    );
    expect(
      screen
        .getByRole("button", { name: "Monday Dinner unavailable" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("rejects unfinished time input and saves 24:00 as a valid end", async () => {
    const { onSave } = setup(model("time_range"), "employee");
    fireEvent.click(screen.getAllByRole("button", { name: "Add hours" })[0]!);
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monday unavailable start" }),
      { target: { value: "broken" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Monday unavailable start" }),
      { target: { value: "23:00" } },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "End of day" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[1]!.range).toEqual({
      start: "23:00",
      end: "24:00",
    });
    expect(onSave.mock.calls[0]![0]).not.toHaveProperty("notes");
  });

  it("shows current default times and lets a previously selected archived type be removed", () => {
    const data = model();
    data.shift_types[0]!.archived = true;
    data.shift_types[0]!.selectable = false;
    data.employee.preference.days[1]!.shift_type_ids = [typeId];
    setup(data, "employee");
    const option = screen.getByRole("button", {
      name: "Monday Dinner unavailable",
    });
    expect(option.getAttribute("title")).toBe("17:00 - 23:00 (archived)");
    fireEvent.click(option);
    expect(
      screen.queryByRole("button", { name: "Monday Dinner unavailable" }),
    ).toBeNull();
  });
});
