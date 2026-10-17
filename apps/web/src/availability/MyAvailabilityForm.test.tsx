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

function model(): WeeklyPreferenceRead {
  return {
    employee_id: "ab910000-0000-4000-8000-000000000001",
    employee_name: "Ada Lovelace",
    can_edit_employee: true,
    can_manage: false,
    time_format: "12h",
    settings: { onboarding_required: false, revision: 3 },
    employee: {
      revision: 2,
      submitted: true,
      updated_at: "2026-10-09T18:00:00.000Z",
      preference: emptyWeeklyPreference(),
    },
    manager: null,
    shift_types: [],
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
      "MondayAvailable all day",
      "TuesdayUnavailable all day",
      "WednesdayAvailable all day",
      "ThursdayAvailable all day",
      "FridayUnavailable after 6:00 PM",
      "SaturdayAvailable all day",
      "SundayAvailable all day",
    ]);
    // Green when open, orange when any of the day is not (Mert 2026-10-16).
    expect(days.map((day) => day.classList.contains("is-blocked"))).toEqual([false, true, false, false, true, false, false]);
    expect(days[0]!.className).toContain("dav-tone is-free");
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
    // Mert 2026-10-17: no dark bar; the card's own row under it.
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
  });

  // Mert 2026-10-17: a row under the week that is always there, so nothing
  // moves: Cancel (white) and Save (green), both faded until a day changes.
  it("keeps Cancel and Save under the week, faded until a day changes", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    const row = screen.getByRole("group", { name: "Save your week" });
    const cancel = within(row).getByRole("button", { name: "Cancel" }) as HTMLButtonElement;
    const save = within(row).getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect([cancel.disabled, save.disabled]).toEqual([true, true]);
    expect(cancel.className).toContain("secondary-button");
    fireEvent.click(radio(/^Unavailable/));
    expect(screen.getByRole("group", { name: "Save your week" })).toBe(row);
    expect([cancel.disabled, save.disabled]).toEqual([false, false]);
    // The live region is always in the row, empty until a save (screen
    // readers miss a region that appears with its text).
    expect(within(row).getByRole("status").textContent).toBe("");
  });

  it("says the week was saved, sliding in from the left, until the next change", async () => {
    const data = model();
    render(<MyAvailabilityForm model={data} onSave={saver(data)} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const done = screen.getByRole("status");
    await screen.findByText("Availability preferences saved");
    expect(screen.getByRole("status")).toBe(done);
    expect(done.textContent).toBe("Availability preferences saved");
    expect(done.className).toContain("dav-saved");
    expect(done.querySelector(".dav-saved-text")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(radio(/^Some hours/));
    expect(screen.getByRole("status")).toBe(done);
    expect(done.textContent).toBe("");
  });

  // A pressed Save or Cancel turns faded; the focus stays in the row, not on the page.
  it("keeps the focus in the row when Save or Cancel fades after a press", async () => {
    const data = model();
    render(<MyAvailabilityForm model={data} onSave={saver(data)} />);
    const row = screen.getByRole("group", { name: "Save your week" });
    fireEvent.click(radio(/^Unavailable/));
    const save = within(row).getByRole("button", { name: "Save" });
    save.focus();
    fireEvent.click(save);
    await screen.findByText("Availability preferences saved");
    expect(document.activeElement).toBe(within(row).getByRole("status"));
    fireEvent.click(radio(/^Some hours/));
    const cancel = within(row).getByRole("button", { name: "Cancel" });
    cancel.focus();
    fireEvent.click(cancel);
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(row);
  });

  it("drops the saved note on the next tap anywhere in the week", async () => {
    const data = model();
    render(<MyAvailabilityForm model={data} onSave={saver(data)} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Availability preferences saved");
    fireEvent.pointerDown(dayRow(3));
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("has no Cancel / Save row in onboarding: the step keeps its own buttons", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} wizard extraAction={<button type="button">Skip for now</button>} />);
    expect(screen.queryByRole("group", { name: "Save your week" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip for now" })).toBeTruthy();
  });

  // M5: a save decides nothing about pending requests; nothing is asked first.
  it("saves the week in today's shape, straight away, with no toast", async () => {
    const data = model();
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    fireEvent.click(radio(/^Some hours/));
    fireEvent.click(dayRow(2));
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const command = onSave.mock.calls[0]![0];
    expect(weeklyPreferenceSaveSchema.parse(command)).toEqual(command);
    expect(command).toEqual({
      employee_id: data.employee_id,
      source: "employee",
      expected_revision: 2,
      settings_revision: 3,
      preference: {
        days: emptyWeeklyPreference().days.map((day) =>
          day.day === 1 ? { ...day, ranges: [{ start: "18:00", end: "24:00" }] } : day.day === 2 ? { ...day, all_day: true } : day,
        ),
      },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    await screen.findByText(/^Shared with your managers · Oct 16$/);
  });

  it("submits a never-shared week that is available every day", async () => {
    const data = model();
    data.employee.submitted = false;
    data.employee.revision = 0;
    data.employee.updated_at = null;
    const onSave = saver(data);
    render(<MyAvailabilityForm model={data} onSave={onSave} />);
    expect(screen.getByText("Not shared yet")).toBeTruthy();
    // Nothing to throw away yet, but the week can be shared as it is.
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].preference).toEqual(emptyWeeklyPreference());
  });

  it("discards back to the saved week and drops the copies", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Tuesday, now Available" }));
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Unsaved changes")).toBeNull();
    expect(radio(/^Available/).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("button", { name: "Tuesday, now Available" }).getAttribute("aria-pressed")).toBe("false");
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0].expected_revision).toBe(2);
  });

  it("keeps the draft when saving fails and never saves twice at once", async () => {
    let fail!: (error: Error) => void;
    const onSave = vi.fn(() => new Promise<WeeklyPreferenceRead>((_resolve, reject) => (fail = reject)));
    render(<MyAvailabilityForm model={model()} onSave={onSave} />);
    fireEvent.click(radio(/^Unavailable/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Not saved.");
    expect(screen.queryByRole("button", { name: "Reload" }) !== null).toBe(offered);
  });

  // Mert 2026-10-16 ("yalnız saat"): the day is asked in hours, never shift types.
  it("asks for hours only", () => {
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: /^Some shifts/ })).toBeNull();
    expect(radio(/^Some hours/)).toBeTruthy();
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
    expect(dayRow(5).textContent).toBe("FridayUnavailable after 6:00 PM");
    await act(async () => vi.advanceTimersByTime(1800));
    expect(dayRow(5).className).not.toContain("is-flash");
  });

  // Mert 2026-10-17: a tap inside the sheet changes only its content; the sheet
  // slides up once, when it opens, and never again while it stays open.
  it("keeps one open sheet through every tap and slides it up only once", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<MyAvailabilityForm model={model()} onSave={vi.fn()} />);
    fireEvent.click(dayRow(2));
    const sheet = screen.getByRole("dialog", { name: "Tuesday" });
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(sheet.classList.contains("is-opening")).toBe(true);
    fireEvent.animationEnd(sheet);
    expect(sheet.classList.contains("is-opening")).toBe(false);
    const taps = [
      () => within(sheet).getByRole("radio", { name: /^Unavailable/ }),
      () => within(sheet).getByRole("radio", { name: /^Some hours/ }),
      () => within(sheet).getByRole("radio", { name: /^Available/ }),
      () => within(sheet).getByRole("button", { name: /^Thursday, / }),
      () => within(sheet).getByRole("button", { name: /^Thursday, / }),
    ];
    for (const target of taps) {
      fireEvent.click(target());
      expect(screen.getByRole("dialog", { name: "Tuesday" })).toBe(sheet);
      expect(sheet.classList.contains("is-opening")).toBe(false);
    }
    fireEvent.change(within(sheet).getByRole("combobox", { name: "From" }), { target: { value: String(9 * 60) } });
    fireEvent.change(within(sheet).getByRole("combobox", { name: "Until" }), { target: { value: String(17 * 60) } });
    expect(screen.getByRole("dialog", { name: "Tuesday" })).toBe(sheet);
    expect(sheet.classList.contains("is-opening")).toBe(false);
    expect(showModal).toHaveBeenCalledTimes(1);
    // A sheet opened again slides up again.
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    fireEvent.click(dayRow(3));
    expect(screen.getByRole("dialog", { name: "Wednesday" }).classList.contains("is-opening")).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(2);
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
      expect(dayRow(1).textContent).toBe("MondayAvailable all day");
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
