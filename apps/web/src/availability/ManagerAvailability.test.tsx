// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyWeeklyPreference,
  weeklyPreferenceReadSchema,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { ManagerAvailability } from "./ManagerAvailability";
import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

const evening = [{ start: "17:00", end: "23:00" }];
function model(): WeeklyPreferenceRead {
  return {
    employee_id: "ab910000-0000-4000-8000-000000000001",
    employee_name: "Ada Lovelace",
    can_edit_employee: false,
    can_manage: true,
    time_format: "24h",
    settings: { onboarding_required: false, revision: 3 },
    employee: {
      revision: 2,
      submitted: true,
      updated_at: "2026-10-09T18:00:00.000Z",
      preference: emptyWeeklyPreference(),
    },
    manager: {
      revision: 4,
      submitted: true,
      updated_at: null,
      preference: emptyWeeklyPreference(),
      enabled: true,
      notes: ["", "Keep this note", "", "", "", "", ""],
    },
    shift_types: [],
  };
}
function saver(data: WeeklyPreferenceRead) {
  return vi.fn(async (command: WeeklyPreferenceSave) => {
    const next = structuredClone(data);
    next.manager!.preference = command.preference;
    next.manager!.revision += 1;
    next.manager!.submitted = true;
    next.manager!.enabled = command.enabled!;
    next.manager!.notes = command.notes!;
    return next;
  });
}
function setup(data = model(), onSave = saver(data)) {
  const result = render(<ManagerAvailability model={data} onSave={onSave} />);
  fireEvent.click(screen.getByRole("tab", { name: /^Manager notes/ }));
  return { ...result, onSave };
}
const days = () => within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("button");
const save = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

describe("Employees drawer, Availability: the employee's week", () => {
  it("opens on the employee's week, read only, with a second tab for the manager's notes", () => {
    const data = model();
    data.employee.preference.days[2]!.all_day = true;
    render(<ManagerAvailability model={data} onSave={vi.fn()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Employee availability", "Manager notes1"]);
    // The badge is drawn; the count is heard in the tab's name.
    expect(screen.getByRole("tab", { name: "Manager notes, 1 note" })).toBe(tabs[1]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Read only. Only Ada can change this.")).toBeTruthy();
    expect(screen.getByText("Updated Oct 9")).toBeTruthy();
    expect(document.querySelector(".avr-sum")?.textContent).toBe("Ada prefers not to work Tue all day.");
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    // KARARLAR M2: the manager never changes the employee's week.
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("says a week never shared is optional", () => {
    const data = model();
    data.employee.submitted = false;
    render(<ManagerAvailability model={data} onSave={vi.fn()} />);
    expect(screen.getByText("Ada hasn't shared availability yet.")).toBeTruthy();
  });

  it("draws no notes when the reader may not see them", () => {
    render(<ManagerAvailability model={{ ...model(), manager: null }} onSave={vi.fn()} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/Manager notes/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText("Read only. Only Ada can change this.")).toBeTruthy();
  });

  it("draws no notes when the person is not an employee (the read leaves the field out)", () => {
    const { manager: _omitted, ...wire } = model();
    const parsed = weeklyPreferenceReadSchema.parse(wire);
    render(<ManagerAvailability model={parsed} onSave={vi.fn()} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText(/Manager notes/)).toBeNull();
  });

  it("names the tabs shortly on the Availability page's phone view", () => {
    render(<ManagerAvailability model={model()} onSave={vi.fn()} short />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Availability", "Manager notes1"]);
  });

  // Mert 2026-10-17 (AVAIL-GUN-S3): on the phone the boxes sit right under the tabs.
  it("drops the lock line and the week sentence on the phone, and keeps them in the drawer", () => {
    render(<ManagerAvailability model={model()} onSave={vi.fn()} short />);
    expect(screen.queryByText("Read only. Only Ada can change this.")).toBeNull();
    expect(document.querySelector(".avr-sum")).toBeNull();
    expect(document.querySelectorAll(".avr-tile")).toHaveLength(7);
    cleanup();
    render(<ManagerAvailability model={model()} onSave={vi.fn()} />);
    expect(screen.getByText("Read only. Only Ada can change this.")).toBeTruthy();
    expect(document.querySelector(".avr-sum")).toBeTruthy();
  });
});

describe("Employees drawer, Availability: Manager notes (the same four parts, Mert 2026-10-16)", () => {
  it("says only managers see the notes and lists a note line for every day", () => {
    setup();
    expect(screen.getByText("Only managers see these notes. Ada doesn't.")).toBeTruthy();
    const notes = within(screen.getByRole("list", { name: "Day notes" })).getAllByRole("listitem");
    expect(notes).toHaveLength(7);
    expect(notes[0]!.textContent).toContain("Monday");
    expect(notes[0]!.textContent).toContain("Keep this note");
    expect(notes[1]!.textContent).toContain("No note");
    expect(screen.getByRole("button", { name: "Edit Monday note" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Tuesday note" })).toBeTruthy();
    expect((screen.getByRole("switch", { name: "Manager notes" }) as HTMLInputElement).checked).toBe(true);
  });

  it("adds a day note, at most 1000 characters, and saves it with the hours", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday note" }));
    const box = screen.getByRole("textbox", { name: "Tuesday note" }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(1000);
    fireEvent.change(box, { target: { value: "Prefers closing on Tuesdays" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox", { name: "Tuesday note" })).toBeNull();
    expect(screen.getByText("Prefers closing on Tuesdays")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Unsaved changes");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      source: "manager",
      notes: ["", "Keep this note", "Prefers closing on Tuesdays", "", "", "", ""],
      enabled: true,
      expected_revision: 4,
      settings_revision: 3,
    });
    await screen.findByText("Saved");
  });

  it("edits a note, cancels an edit, and deletes a note", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit Monday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Keep this note")).toBeTruthy();
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Edit Monday note" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(screen.queryByText("Keep this note")).toBeNull();
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].notes).toEqual(["", "", "", "", "", "", ""]);
  });

  it("marks the manager's own hours day by day, the same editor the employee has", async () => {
    const { onSave } = setup();
    expect(days().map((day) => day.textContent)).toEqual([
      "MondayAvailable all day",
      "TuesdayAvailable all day",
      "WednesdayAvailable all day",
      "ThursdayAvailable all day",
      "FridayAvailable all day",
      "SaturdayAvailable all day",
      "SundayAvailable all day",
    ]);
    fireEvent.click(days()[2]!);
    expect(screen.getByRole("heading", { name: "Wednesday" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
    expect(days()[2]!.textContent).toBe("WednesdayUnavailable all day");
    expect(days()[2]!.className).toContain("is-blocked");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[3]).toEqual({ day: 3, all_day: true, ranges: [] });
  });

  it("copies the employee's week exactly (Copy, then Save), keeping the notes", async () => {
    const data = model();
    data.employee.preference.days[2]!.all_day = true;
    data.manager!.preference.days[1]!.ranges = evening;
    const { onSave } = setup(data);
    expect(days()[0]!.textContent).toBe("MondayUnavailable 17:00 – 23:00");
    fireEvent.click(screen.getByRole("button", { name: "Use employee preferences" }));
    expect(days()[0]!.textContent).toBe("MondayAvailable all day");
    expect(days()[1]!.textContent).toBe("TuesdayUnavailable all day");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      preference: data.employee.preference,
      copy_employee_revision: 2,
      notes: data.manager!.notes,
      expected_revision: 4,
    });
    await screen.findByText("Saved");
    expect(days()[1]!.textContent).toBe("TuesdayUnavailable all day");
  });

  it("drops the copy's revision once the copied week is changed", async () => {
    const data = model();
    data.employee.preference.days[2]!.all_day = true;
    const { onSave } = setup(data);
    fireEvent.click(screen.getByRole("button", { name: "Use employee preferences" }));
    fireEvent.click(days()[0]!);
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].copy_employee_revision).toBeUndefined();
  });

  it("clears the hours and keeps the notes", async () => {
    const data = model();
    data.manager!.preference.days[1]!.ranges = evening;
    const { onSave } = setup(data);
    fireEvent.click(screen.getByRole("button", { name: "Clear all hours" }));
    expect(days()[0]!.textContent).toBe("MondayAvailable all day");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference).toEqual(emptyWeeklyPreference());
    expect(onSave.mock.calls[0]![0].notes).toEqual(data.manager!.notes);
  });

  it("keeps the notes while off and saves the switch with them", async () => {
    const data = model();
    data.manager!.preference.days[1]!.ranges = evening;
    const { onSave } = setup(data);
    fireEvent.click(screen.getByRole("switch", { name: "Manager notes" }));
    expect(screen.getByText("Manager notes are off. Saved hours and notes are kept.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Use employee preferences" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Edit Monday note" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("radio")[0] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      enabled: false,
      preference: data.manager!.preference,
      notes: data.manager!.notes,
    });
  });

  it("cannot copy a week never shared, but copies a shared empty week", () => {
    const data = model();
    data.employee.submitted = false;
    const { rerender, onSave } = setup(data);
    const copy = () => screen.getByRole("button", { name: "Use employee preferences" }) as HTMLButtonElement;
    expect(copy().disabled).toBe(true);
    rerender(<ManagerAvailability model={{ ...data, employee: { ...data.employee, submitted: true } }} onSave={onSave} />);
    expect(copy().disabled).toBe(false);
  });

  it("follows the server when the reader may only read: nothing to change, nothing to save", () => {
    setup({ ...model(), can_manage: false });
    expect(screen.getByRole("switch", { name: "Manager notes" }).hasAttribute("disabled")).toBe(true);
    expect(save().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Edit Monday note" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("drops a notes draft when moving between the two tabs", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit Monday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("tab", { name: "Employee availability" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Employee availability" }), { key: "ArrowRight" });
    expect(screen.getByText("Keep this note")).toBeTruthy();
  });

  it("never carries a draft into another employee's drawer", () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(screen.getByRole("button", { name: "Edit Monday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    rerender(
      <ManagerAvailability model={{ ...data, employee_id: "ab910000-0000-4000-8000-000000000002" }} onSave={onSave} />,
    );
    expect(screen.getByRole("tab", { name: "Employee availability" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: /^Manager notes/ }));
    expect(screen.getByText("Keep this note")).toBeTruthy();
  });

  it("keeps a dirty draft and its first revision when the model refreshes", async () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Late" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    const refreshed = structuredClone(data);
    refreshed.manager!.revision = 5;
    rerender(<ManagerAvailability model={refreshed} onSave={onSave} />);
    expect(screen.getByText("Late")).toBeTruthy();
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].expected_revision).toBe(4);
  });

  it("keeps the draft when a save fails and sends one save at a time", async () => {
    let fail!: (error: Error) => void;
    const onSave = vi.fn(() => new Promise<WeeklyPreferenceRead>((_resolve, reject) => (fail = reject)));
    setup(model(), onSave);
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Late" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(save());
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Saving...");
    await act(async () => fail(new Error("Changes could not be saved. Your draft is still here.")));
    expect(screen.getByRole("alert").textContent).toContain("Changes could not be saved.");
    expect(screen.getByText("Late")).toBeTruthy();
  });

  it("offers Reload when someone saved first, and takes their notes", async () => {
    const data = model();
    const latest = structuredClone(data);
    latest.manager!.revision = 7;
    latest.manager!.notes = ["", "Their note", "", "", "", "", ""];
    const onSave = vi.fn(async () => {
      throw new RequestError("Availability changed. Reload before saving; your draft has not been saved.", "availability.changed", undefined, 409);
    });
    const onReload = vi.fn(async () => latest);
    render(<ManagerAvailability model={data} onSave={onSave} onReload={onReload} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Manager notes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add Tuesday note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Availability changed.");
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    await screen.findByText("Their note");
    expect(onReload).toHaveBeenCalledOnce();
    expect(screen.queryByText("Mine")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Manager notes on a phone (720 px and below)", () => {
  beforeEach(() => stubPhoneWidth());

  it("opens a day of the manager's hours in a sheet; Done keeps it in the draft for Save", async () => {
    const { onSave } = setup();
    expect(screen.queryByRole("navigation", { name: "Days" })).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="5"]')!);
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('.avm-week [data-weekday="5"]')!.textContent).toBe("FridayUnavailable all day");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[5]!.all_day).toBe(true);
  });

  it("leaves the week as it was when the sheet is cancelled", () => {
    setup();
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="5"]')!);
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(document.querySelector('.avm-week [data-weekday="5"]')!.textContent).toBe("FridayAvailable all day");
    expect(save().disabled).toBe(true);
  });
});
