// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyWeeklyPreference,
  weeklyPreferenceSaveSchema,
  type WeeklyPreferenceRead,
  type WeeklyPreferenceSave,
} from "@newfork/shared";
import { MyAvailabilityForm } from "./MyAvailabilityForm";
import { requestAppNavigation } from "../shell/leave-guard";
import { RequestError } from "../lib/request-error";
import { stubPhoneWidth } from "../lib/phone-width.test-util";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

const dinner = "ab920000-0000-4000-8000-000000000001";
function model(mode: "shift_type" | "time_range" = "time_range"): WeeklyPreferenceRead {
  return {
    employee_id: "ab910000-0000-4000-8000-000000000001",
    employee_name: "Ada Lovelace",
    can_edit_employee: true,
    can_manage: false,
    time_format: "12h",
    settings: { input_mode: mode, onboarding_required: false, revision: 3 },
    employee: {
      revision: 2,
      submitted: true,
      updated_at: "2026-10-09T18:00:00.000Z",
      preference: emptyWeeklyPreference(mode),
    },
    manager: null,
    shift_types: [
      { id: dinner, name: "Dinner", start_time: "17:00", end_time: "23:00", archived: false, selectable: true },
      { id: "ab920000-0000-4000-8000-000000000002", name: "Lunch", start_time: "11:00", end_time: "15:00", archived: false, selectable: true },
    ],
  };
}
function saver(data: WeeklyPreferenceRead) {
  return vi.fn(async (command: WeeklyPreferenceSave) => {
    const next = structuredClone(data);
    next.employee.preference = command.preference;
    next.employee.revision += 1;
    next.employee.submitted = true;
    next.employee.updated_at = "2026-10-16T18:00:00.000Z";
    return next;
  });
}
const radio = (name: RegExp) => screen.getByRole("radio", { name });
const dayRow = (weekday: number) => document.querySelector<HTMLElement>(`[data-weekday="${weekday}"]`)!;

describe("desktop: the days on the left, the day on the right", () => {
  it("lists the seven days with their state and edits the chosen one", () => {
    const data = model();
    data.employee.preference.days[2]!.all_day = true;
    data.employee.preference.days[5]!.ranges = [{ start: "18:00", end: "24:00" }];
    render(<MyAvailabilityForm model={data} onSave={vi.fn()} />);
    const days = within(screen.getByRole("navigation", { name: "Days" })).getAllByRole("button");
    expect(days.map((day) => day.textContent)).toEqual([
      "MondayAvailable",
      "TuesdayUnavailable all day",
      "WednesdayAvailable",
      "ThursdayAvailable",
      "FridayAfter 6 PM",
      "SaturdayAvailable",
      "SundayAvailable",
    ]);
    expect(days[0]!.getAttribute("aria-current")).toBe("true");
    fireEvent.click(days[4]!);
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Friday");
    expect(days[4]!.getAttribute("aria-current")).toBe("true");
    expect(radio(/^Some hours/).getAttribute("aria-checked")).toBe("true");
    // No arrows and no "day n of 7": the list is the only way between days.
    expect(screen.queryByText(/of 7/i)).toBeNull();
  });

  it("says when the week was shared, and that changes are unsaved", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    expect(screen.getByText(/^Shared with your managers · Oct 9$/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    // Tur 2: no standing explainer and no summary sentence.
    expect(screen.queryByText(/preference, not a guarantee/)).toBeNull();
    fireEvent.click(radio(/^Unavailable/));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Unsaved changes" }).textContent).toContain(
      "1 day changed. Your managers see it after you save.",
    );
  });

  // M5: a save decides nothing about pending requests; nothing is asked first.
  it("saves the week in today's shape, straight away, with no toast", async () => {
    const data = model();
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    fireEvent.click(radio(/^Some hours/));
    fireEvent.click(dayRow(2));
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const command = onSave.mock.calls[0]![0];
    expect(weeklyPreferenceSaveSchema.parse(command)).toEqual(command);
    expect(command).toEqual({
      employee_id: data.employee_id,
      source: "employee",
      expected_revision: 2,
      settings_revision: 3,
      preference: {
        input_mode: "time_range",
        days: emptyWeeklyPreference("time_range").days.map((day) =>
          day.day === 1 ? { ...day, ranges: [{ start: "18:00", end: "24:00" }] } : day.day === 2 ? { ...day, all_day: true } : day,
        ),
      },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await screen.findByText(/^Shared with your managers · Oct 16$/);
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  });

  it("submits a never-shared week that is available every day", async () => {
    const data = model();
    data.employee.submitted = false;
    data.employee.revision = 0;
    data.employee.updated_at = null;
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    expect(screen.getByText("Not shared yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference).toEqual(emptyWeeklyPreference("time_range"));
  });

  it("discards back to the saved week and drops the copies", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, now Available" }));
    expect(screen.getByRole("region", { name: "Unsaved changes" }).textContent).toContain("2 days changed");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(radio(/^Available/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Tuesday, now Available" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("asks a saved day with several ranges to keep one before saving", async () => {
    const data = model();
    data.employee.preference.days[1]!.ranges = [
      { start: "09:00", end: "12:00" },
      { start: "17:00", end: "24:00" },
    ];
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    expect(dayRow(1).textContent).toBe("Monday9 AM – 12 PM, After 5 PM");
    fireEvent.click(dayRow(3));
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Keep one time range on Monday.");
    expect(onSave).not.toHaveBeenCalled();
    // Touching Monday's strip brings it down to one range.
    fireEvent.click(dayRow(1));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Start of unavailable hours" }), { key: "ArrowRight" });
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[1]!.ranges).toEqual([{ start: "09:30", end: "24:00" }]);
  });

  it("keeps a dirty draft and the revision it read through a live refresh", async () => {
    const data = model();
    const onSave = saver(data);
    const { rerender } = render(<MyAvailabilityForm model={data} onSave={onSave} />);
    fireEvent.click(radio(/^Unavailable/));
    const refreshed = structuredClone(data);
    refreshed.employee.revision = 5;
    rerender(<MyAvailabilityForm model={refreshed} onSave={onSave} />);
    expect(radio(/^Unavailable/).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].expected_revision).toBe(2);
  });

  it("keeps the draft when saving fails and never saves twice at once", async () => {
    let fail!: (error: Error) => void;
    const onSave = vi.fn(() => new Promise<WeeklyPreferenceRead>((_resolve, reject) => (fail = reject)));
    render(<MyAvailabilityForm model={model()} onSave={onSave} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    fireEvent.click(screen.getByRole("button", { name: "Saving..." }));
    expect(onSave).toHaveBeenCalledOnce();
    await act(async () => fail(new Error("Connection lost")));
    expect(screen.getByRole("alert").textContent).toContain("Connection lost");
    expect(radio(/^Unavailable/).getAttribute("aria-checked")).toBe("true");
  });

  // BL-1028: only "the week or its settings changed meanwhile" has a newer week to reload.
  it.each([
    ["availability.changed", true],
    ["schedule.busy", false],
  ] as const)("offers Reload for a 409 keyed %s: %s", async (reason, offered) => {
    const onSave = vi.fn(async (): Promise<WeeklyPreferenceRead> => {
      throw new RequestError("Not saved.", reason, undefined, 409);
    });
    render(<MyAvailabilityForm model={model()} onSave={onSave} onReload={vi.fn()} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save availability" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Not saved.");
    expect(screen.queryByRole("button", { name: "Reload" }) !== null).toBe(offered);
  });

  it("lets a type no longer offered be taken off a day that holds it", () => {
    const data = model("shift_type");
    data.shift_types[0]!.archived = true;
    data.shift_types[0]!.selectable = false;
    data.employee.preference.days[1]!.shift_type_ids = [dinner];
    render(<MyAvailabilityForm model={data} onSave={vi.fn()} />);
    const option = screen.getByRole("button", { name: /^Dinner/ });
    expect(option.textContent).toContain("5 PM – 11 PM · Previous");
    fireEvent.click(option);
    expect(screen.queryByRole("button", { name: /^Dinner/ })).toBeNull();
    expect(radio(/^Available/).getAttribute("aria-checked")).toBe("true");
  });
});

// C2.3, P26: unsaved days ask before they are lost (the shared ConfirmDialog).
describe("unsaved changes", () => {
  it("asks before leaving an unsaved week, and discards on request", async () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    fireEvent.click(radio(/^Unavailable/));
    const navigate = vi.fn();
    act(() => requestAppNavigation(navigate));
    const dialog = await screen.findByRole("alertdialog", { name: "Discard availability changes?" });
    expect(dialog.textContent).toContain("Your unsaved hours will be lost.");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(navigate).toHaveBeenCalledOnce();
  });
  it("leaves a saved week without asking", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    const navigate = vi.fn();
    act(() => requestAppNavigation(navigate));
    expect(navigate).toHaveBeenCalledOnce();
  });
});

describe("phone: the week as a list, a day in a sheet", () => {
  beforeEach(() => stubPhoneWidth());

  it("opens a day in a sheet, saves that day and the days it was copied to, and lights them up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const data = model();
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    expect(screen.queryByRole("navigation", { name: "Days" })).toBeNull();
    fireEvent.click(dayRow(5));
    const sheet = screen.getByRole("dialog", { name: "Friday" });
    expect(sheet.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(within(sheet).getByRole("heading", { name: "Friday" }));
    const save = within(sheet).getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole("radio", { name: /^Some hours/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Thursday, now Available" }));
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const days = onSave.mock.calls[0]![0].preference.days;
    expect(days[5]!.ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    expect(days[4]!.ranges).toEqual([{ start: "18:00", end: "24:00" }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(dayRow(5).className).toContain("is-flash");
    expect(dayRow(4).className).toContain("is-flash");
    expect(dayRow(3).className).not.toContain("is-flash");
    expect(dayRow(5).textContent).toBe("FridayAfter 6 PM");
    await act(async () => vi.advanceTimersByTime(1800));
    expect(dayRow(5).className).not.toContain("is-flash");
  });

  it("drops the day's changes on Cancel, the close button and Escape", () => {
    const onSave = vi.fn();
    render(<MyAvailabilityForm model={model()} onSave={onSave} />);
    for (const close of [
      () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })),
      () => fireEvent.click(screen.getByRole("button", { name: "Close" })),
      () => fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true })),
    ]) {
      fireEvent.click(dayRow(1));
      fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
      close();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(dayRow(1).textContent).toBe("MondayAvailable");
    }
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps the sheet open with the reason when the save fails", async () => {
    const onSave = vi.fn(async (): Promise<WeeklyPreferenceRead> => {
      throw new Error("Connection lost");
    });
    render(<MyAvailabilityForm model={model()} onSave={onSave} />);
    fireEvent.click(dayRow(1));
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const sheet = screen.getByRole("dialog");
    expect((await within(sheet).findByRole("alert")).textContent).toContain("Connection lost");
    expect(within(sheet).getByRole("radio", { name: /^Unavailable/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("in onboarding, Done keeps the day in the draft and the step's button saves", async () => {
    const data = model();
    data.employee.submitted = false;
    data.employee.revision = 0;
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} wizard extraAction={<button type="button">Skip for now</button>} />);
    fireEvent.click(dayRow(0));
    fireEvent.click(screen.getByRole("radio", { name: /^Unavailable/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dayRow(0).textContent).toBe("SundayUnavailable all day");
    fireEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference.days[0]!.all_day).toBe(true);
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
  });
});
