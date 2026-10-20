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

  it("draws a week never shared as seven open days", () => {
    const data = model();
    data.employee.submitted = false;
    render(<ManagerAvailability model={data} onSave={vi.fn()} />);
    const boxes = within(screen.getByRole("list", { name: "Ada's week" })).getAllByRole("listitem");
    expect(boxes).toHaveLength(7);
    expect(boxes.every((box) => box.className.includes("is-free"))).toBe(true);
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

describe("Employees drawer, Availability: Manager notes (the same four parts, Mert 2026-10-16; one list, S-185)", () => {
  // Mert 2026-10-19 (S-185, "A · Gün sayfasında saat + not"): one Mon–Sun list; a day holds its hours and its note.
  it("lists the week once: each day says its hours and the first line of its note, and no second list", () => {
    setup();
    expect(screen.getByText("Only managers see these notes. Ada doesn't.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hours and notes" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Day notes" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Day notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Add|Edit) \w+ note$/ })).toBeNull();
    expect(days()).toHaveLength(7);
    expect(days()[0]!.textContent).toBe("MondayAvailable all dayKeep this note");
    expect(days()[1]!.textContent).toBe("TuesdayAvailable all day");
    expect((screen.getByRole("switch", { name: "Manager notes" }) as HTMLInputElement).checked).toBe(true);
  });

  it("writes a day's note under its hours, at most 1000 characters, and saves it with the hours", async () => {
    const { onSave } = setup();
    fireEvent.click(days()[1]!);
    const box = screen.getByRole("textbox", { name: "Tuesday note" }) as HTMLTextAreaElement;
    expect(box.maxLength).toBe(1000);
    expect(box.value).toBe("");
    fireEvent.change(box, { target: { value: "Prefers closing on Tuesdays" } });
    expect(screen.getByText("27 / 1000")).toBeTruthy();
    expect(days()[1]!.textContent).toBe("TuesdayAvailable all dayPrefers closing on Tuesdays");
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

  it("empties a note, and Discard brings it back", async () => {
    const { onSave } = setup();
    const box = () => screen.getByRole("textbox", { name: "Monday note" }) as HTMLTextAreaElement;
    expect(box().value).toBe("Keep this note");
    fireEvent.change(box(), { target: { value: "" } });
    expect(days()[0]!.textContent).toBe("MondayAvailable all day");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(box().value).toBe("Keep this note");
    expect(save().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].notes).toEqual(["", "", "", "", "", "", ""]);
  });

  it("copies a day with its note; pressed again, the other day is as it was", async () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
    const tuesday = () => within(screen.getByRole("group", { name: "Copy Monday to" })).getByRole("button", { name: /^Tuesday,/ });
    fireEvent.click(tuesday());
    expect(days()[1]!.textContent).toBe("TuesdayUnavailable all dayKeep this note");
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "School" } });
    expect(days()[1]!.textContent).toBe("TuesdayUnavailable all daySchool");
    fireEvent.click(tuesday());
    expect(days()[1]!.textContent).toBe("TuesdayAvailable all day");
    fireEvent.click(tuesday());
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].notes).toEqual(["", "School", "School", "", "", "", ""]);
    expect(onSave.mock.calls[0]![0].preference.days[2]).toEqual({ day: 2, all_day: true, ranges: [] });
  });

  it("marks the manager's own hours day by day, the same editor the employee has", async () => {
    const { onSave } = setup();
    expect(days().map((day) => day.textContent)).toEqual([
      "MondayAvailable all dayKeep this note",
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
    expect(days()[0]!.textContent).toBe("MondayUnavailable 17:00 – 23:00Keep this note");
    fireEvent.click(screen.getByRole("button", { name: "Use employee preferences" }));
    expect(days()[0]!.textContent).toBe("MondayAvailable all dayKeep this note");
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
    expect(days()[0]!.textContent).toBe("MondayAvailable all dayKeep this note");
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
    expect((screen.getByRole("textbox", { name: "Monday note" }) as HTMLTextAreaElement).disabled).toBe(true);
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
    expect((screen.getByRole("textbox", { name: "Monday note" }) as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("drops a notes draft when moving between the two tabs", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "Changed" } });
    fireEvent.click(screen.getByRole("tab", { name: "Employee availability" }));
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Employee availability" }), { key: "ArrowRight" });
    expect((screen.getByRole("textbox", { name: "Monday note" }) as HTMLTextAreaElement).value).toBe("Keep this note");
  });

  it("never carries a draft into another employee's drawer", () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.change(screen.getByRole("textbox", { name: "Monday note" }), { target: { value: "Changed" } });
    rerender(
      <ManagerAvailability model={{ ...data, employee_id: "ab910000-0000-4000-8000-000000000002" }} onSave={onSave} />,
    );
    expect(screen.getByRole("tab", { name: "Employee availability" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: /^Manager notes/ }));
    expect((screen.getByRole("textbox", { name: "Monday note" }) as HTMLTextAreaElement).value).toBe("Keep this note");
  });

  it("keeps a dirty draft and its first revision when the model refreshes", async () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(days()[1]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Late" } });
    const refreshed = structuredClone(data);
    refreshed.manager!.revision = 5;
    rerender(<ManagerAvailability model={refreshed} onSave={onSave} />);
    expect((screen.getByRole("textbox", { name: "Tuesday note" }) as HTMLTextAreaElement).value).toBe("Late");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].expected_revision).toBe(4);
  });

  it("keeps the draft when a save fails and sends one save at a time", async () => {
    let fail!: (error: Error) => void;
    const onSave = vi.fn(() => new Promise<WeeklyPreferenceRead>((_resolve, reject) => (fail = reject)));
    setup(model(), onSave);
    fireEvent.click(days()[1]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Late" } });
    fireEvent.click(save());
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("Saving...");
    await act(async () => fail(new Error("Changes could not be saved. Your draft is still here.")));
    expect(screen.getByRole("alert").textContent).toContain("Changes could not be saved.");
    expect((screen.getByRole("textbox", { name: "Tuesday note" }) as HTMLTextAreaElement).value).toBe("Late");
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
    fireEvent.click(days()[1]!);
    fireEvent.change(screen.getByRole("textbox", { name: "Tuesday note" }), { target: { value: "Mine" } });
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Availability changed.");
    fireEvent.click(within(alert).getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(days()[0]!.textContent).toContain("Their note"));
    expect(onReload).toHaveBeenCalledOnce();
    expect((screen.getByRole("textbox", { name: "Tuesday note" }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Manager notes on a phone (720 px and below)", () => {
  beforeEach(() => stubPhoneWidth());

  it("opens a day in a sheet with its hours and its note; Done keeps both in the draft for Save", async () => {
    const { onSave } = setup();
    expect(screen.queryByRole("navigation", { name: "Days" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Day notes" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="5"]')!);
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Friday note" }), { target: { value: "Class until 6" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector('.avm-week [data-weekday="5"]')!.textContent).toBe("FridayUnavailable all dayClass until 6");
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[5]!.all_day).toBe(true);
    expect(onSave.mock.calls[0]![0].notes![5]).toBe("Class until 6");
  });

  // nf-guvenlik @4f8de4311: a refresh while the sheet is open must not lose another manager's note.
  it("writes back only the notes the sheet changed, so a note saved meanwhile stays", async () => {
    const data = model();
    const { rerender, onSave } = setup(data);
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="5"]')!);
    const refreshed = structuredClone(data);
    refreshed.manager!.revision = 5;
    refreshed.manager!.notes = ["", "Keep this note", "", "Theirs", "", "", ""];
    rerender(<ManagerAvailability model={refreshed} onSave={onSave} />);
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Friday note" }), { target: { value: "Mine" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(document.querySelector('.avm-week [data-weekday="3"]')!.textContent).toBe("WednesdayAvailable all dayTheirs");
    fireEvent.click(save());
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      expected_revision: 5,
      notes: ["", "Keep this note", "", "Theirs", "", "Mine", ""],
    });
  });

  it("names a day by its hours and describes it by its note", () => {
    setup();
    const monday = document.querySelector<HTMLElement>('.avm-week [data-weekday="1"]')!;
    expect(monday.getAttribute("aria-label")).toBe("Monday, Available all day");
    expect(document.getElementById(monday.getAttribute("aria-describedby")!)?.textContent).toBe("Keep this note");
    fireEvent.click(monday);
    const box = within(screen.getByRole("dialog", { name: "Monday" })).getByRole("textbox", { name: "Monday note" });
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe("14 / 1000");
  });

  it("copies the day with its note from the sheet", () => {
    setup();
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="1"]')!);
    const sheet = screen.getByRole("dialog", { name: "Monday" });
    const done = within(sheet).getByRole("button", { name: "Done" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Monday note" }), { target: { value: "Keep this note too" } });
    expect(done.disabled).toBe(false);
    fireEvent.click(within(sheet).getByRole("button", { name: /^Wednesday,/ }));
    fireEvent.click(done);
    expect(document.querySelector('.avm-week [data-weekday="1"]')!.textContent).toBe("MondayAvailable all dayKeep this note too");
    expect(document.querySelector('.avm-week [data-weekday="3"]')!.textContent).toBe("WednesdayAvailable all dayKeep this note too");
  });

  it("leaves the week as it was when the sheet is cancelled", () => {
    setup();
    fireEvent.click(document.querySelector<HTMLElement>('.avm-week [data-weekday="5"]')!);
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.change(within(sheet).getByRole("textbox", { name: "Friday note" }), { target: { value: "Gone" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(document.querySelector('.avm-week [data-weekday="5"]')!.textContent).toBe("FridayAvailable all day");
    expect(save().disabled).toBe(true);
  });
});
