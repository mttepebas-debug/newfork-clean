// The shift window's form (BEHAVIOR §10): starting values, typed times,
// eligible people, validation and the save label. Drawn by each direction.
import { useMemo, useState } from "react";
import type { Shift } from "./model";
import { formatTime, minutesOf, shiftMinutes } from "./model";
import { scheduleJobOf } from "./derive";
import { assess, eligiblePeople } from "./rules";
import type { Schedule } from "./useSchedule";

export const BREAKS = [0, 15, 30, 45, 60];

/** "9", "9a", "9:30 pm", "930p", "17:00" → "HH:MM" or null. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    if (m[3].startsWith("p") && h !== 12) h += 12;
    if (m[3].startsWith("a") && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function useEditorForm(s: Schedule) {
  const editor = s.editor!;
  const week = s.week!;
  const existing = editor.shiftId ? s.shiftById(editor.shiftId) : undefined;
  const person = week.employees.find((e) => e.id === editor.target.employeeId);

  const initial = useMemo(() => {
    if (existing) return existing;
    // Job: the person's schedule job, else the first non-Owner job (rule 131).
    const jobId = (person && scheduleJobOf(week, person)) ?? week.jobs.find((j) => !j.owner)?.id ?? week.jobs[0]?.id ?? "";
    const type = week.shiftTypes.find((t) => t.id === editor.presetTypeId) ?? null;
    const timeSource = type ?? week.shiftTypes[0];
    return {
      jobId,
      shiftTypeId: type?.id ?? null,
      start: timeSource?.start ?? "09:00",
      end: timeSource?.end ?? "17:00",
      breakMinutes: 30,
      note: "",
      labels: [],
      hideTime: false,
    };
  }, [existing, person, week, editor.presetTypeId]);

  const fmt = week.timeFormat;
  const [typeId, setTypeId] = useState<string | null>(initial.shiftTypeId);
  const [jobId, setJobId] = useState(initial.jobId);
  const [startText, setStartText] = useState(formatTime(initial.start, fmt));
  const [endText, setEndText] = useState(formatTime(initial.end, fmt));
  const [timesTouched, setTimesTouched] = useState(false);
  const [breakMinutes, setBreak] = useState(initial.breakMinutes);
  const [note, setNote] = useState(initial.note);
  const [who, setWho] = useState<string | null>(editor.target.employeeId);
  const [count, setCount] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ackWarning, setAckWarning] = useState(false);

  const start = parseTime(startText);
  const end = parseTime(endText);
  const timeError = !start || !end ? "Enter start and end time." : start === end ? "Start and end can't be the same time." : null;

  const pickType = (id: string | null) => {
    setTypeId(id);
    const t = week.shiftTypes.find((x) => x.id === id);
    // A type applies its default hours unless the times were already edited (rule 132).
    if (t && !timesTouched && t.start && t.end) {
      setStartText(formatTime(t.start, fmt));
      setEndText(formatTime(t.end, fmt));
    }
  };

  const values: Omit<Shift, "id" | "origin"> = {
    locationId: editor.target.locationId,
    employeeId: count > 1 ? null : who,
    jobId,
    shiftTypeId: typeId,
    date: editor.target.date,
    start,
    end,
    breakMinutes,
    note: count > 1 ? "" : note,
    labels: existing?.labels ?? [],
    hideTime: existing?.hideTime ?? false,
  };

  const jobsForPerson = useMemo(() => {
    const person = week.employees.find((e) => e.id === who);
    return person ? week.jobs.filter((j) => person.jobIds.includes(j.id)) : week.jobs.filter((j) => !j.owner);
  }, [week, who]);

  const people = useMemo(
    () =>
      eligiblePeople(
        week,
        s.shifts,
        { id: existing?.id, jobId, shiftTypeId: typeId, start, end },
        { locationId: editor.target.locationId, date: editor.target.date },
        existing?.employeeId ?? null,
      ),
    [week, s.shifts, existing, jobId, typeId, start, end, editor.target],
  );

  const check = who && start && end
    ? assess({ week, shifts: s.shifts, candidate: { id: existing?.id, jobId, shiftTypeId: typeId, start, end }, target: { employeeId: who, locationId: editor.target.locationId, date: editor.target.date }, ignoreId: existing?.id })
    : null;

  const changed =
    !existing ||
    existing.jobId !== jobId ||
    existing.shiftTypeId !== typeId ||
    existing.start !== start ||
    existing.end !== end ||
    existing.breakMinutes !== breakMinutes ||
    existing.note !== note ||
    existing.employeeId !== who;

  const paid = start && end ? shiftMinutes({ start, end, breakMinutes }) : 0;
  const overnight = start && end ? (minutesOf(end) ?? 0) <= (minutesOf(start) ?? 0) : false;

  const saveLabel = existing ? "Save" : count > 1 ? `Add ${count} shifts` : "Add shift";
  const canSave = !timeError && changed && check?.status !== "blocked";
  const needsAck = check?.status === "warning" && !ackWarning;

  const save = () => {
    if (!changed) return s.setEditor(null);
    if (!canSave) return;
    if (needsAck) return setAckWarning(true);
    s.saveShifts({ shiftId: existing?.id ?? null, values, count });
  };

  const remove = () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      window.setTimeout(() => setConfirmDelete(false), 3200);
      return;
    }
    s.removeShifts([existing.id]);
    s.setEditor(null);
  };

  return {
    title: existing ? "Edit shift" : "Add shift",
    existing,
    person,
    fields: { typeId, jobId, startText, endText, breakMinutes, note, who, count },
    setType: pickType,
    setJob: setJobId,
    setStartText: (v: string) => (setTimesTouched(true), setStartText(v)),
    setEndText: (v: string) => (setTimesTouched(true), setEndText(v)),
    setBreak,
    setNote: (v: string) => setNote(v.slice(0, 500)),
    setWho,
    setCount: (n: number) => setCount(Math.min(10, Math.max(1, n))),
    timeError,
    paid,
    overnight,
    check,
    needsAck,
    ackWarning,
    jobsForPerson,
    people,
    showWho: !editor.target.employeeId || Boolean(existing),
    showCount: !editor.target.employeeId && !existing,
    canSave,
    saveLabel: needsAck || ackWarning ? `${existing ? "Save" : "Add"} anyway` : saveLabel,
    save,
    remove,
    confirmDelete,
    noteLeft: 500 - note.length,
  };
}

export type EditorForm = ReturnType<typeof useEditorForm>;

/** Weeks of a month for the mini calendar, Monday first. */
export function monthGrid(anchor: string): string[][] {
  const [y = 2000, m = 1] = anchor.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(1 - offset);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w += 1) {
    const row: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(start);
      day.setUTCDate(start.getUTCDate() + w * 7 + d);
      row.push(day.toISOString().slice(0, 10));
    }
    weeks.push(row);
  }
  return weeks;
}
