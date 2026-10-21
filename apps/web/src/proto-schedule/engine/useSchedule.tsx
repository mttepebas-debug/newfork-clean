// The schedule's behaviour in one place (BEHAVIOR.md). Every direction draws
// its own screen and wires these handlers to its own elements; the rules live
// only here. Edits stay in memory: nothing here writes to the server.
import { scheduleReadModelSchema } from "@newfork/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router";
import { apiRequest, supabaseClient } from "../../lib/supabase";
import type { Employee, Shift, Week } from "./model";
import { addDays, readWeek, todayIso } from "./model";
import type { Column, ColumnGroup, DisplaySettings, GridModel, Row } from "./derive";
import { buildGrid, defaultDisplay, isCurrentPeriod, jobOf, scheduleJobOf, shiftTitle, typeOf } from "./derive";
import type { Assessment, Target } from "./rules";
import { assess, foldedFor } from "./rules";
import { FOCUS_KEYS, readUrl, UrlDraft } from "./url";
import type { FilterKey, UrlState } from "./url";

// ---------------------------------------------------------------- types

export type TopMenu = "locations" | "shiftTypes" | "jobs" | "employees" | "settings" | "calendar" | null;
export type TopSurface = "newSchedule" | "publish" | null;

export type EditorState = {
  mode: "add" | "edit";
  shiftId: string | null;
  target: Target;
  anchor: { x: number; y: number };
  presetTypeId?: string | null;
};

export type MenuState =
  | { kind: "card"; shiftId: string; x: number; y: number }
  | { kind: "cell"; target: Target; x: number; y: number }
  | null;

export type Sheet =
  | { kind: "drop"; title: string; messages: string[]; apply: () => void }
  | { kind: "paste"; title: string; messages: string[]; context: string }
  | null;

export type Toast = { id: number; tone: "info" | "success" | "error" | "warning"; title: string; body?: string };

export type DragState = {
  shiftId: string;
  copy: boolean;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  target: Target | null;
  targetCellKey: string | null;
  own: boolean;
  assessment: Assessment | null;
};

type Session = {
  weekStart: string;
  locationIds: string[];
  shifts: Shift[];
  history: Shift[][];
  dirty: boolean;
};

const displayKey = "proto-schedule-display";
const readDisplay = (): DisplaySettings => {
  try {
    return { ...defaultDisplay, ...(JSON.parse(localStorage.getItem(displayKey) ?? "{}") as Partial<DisplaySettings>) };
  } catch {
    return defaultDisplay;
  }
};

const isTextTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const inLayer = (el: Element | null) => Boolean(el?.closest("[data-proto-layer]"));
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `new-${Date.now()}-${Math.random()}`);

// ---------------------------------------------------------------- hook

function useScheduleController() {
  const [params, setParams] = useSearchParams();
  const url = useMemo(() => readUrl(params), [params]);
  const today = todayIso();
  const date = url.date ?? today;

  const query = useQuery({
    queryKey: ["proto-schedule", date],
    queryFn: async () => {
      const raw = await apiRequest(supabaseClient!, `/schedule/reference?date=${date}&view=week`);
      return readWeek(scheduleReadModelSchema.parse(raw));
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const week: Week | undefined = query.data;

  // ---- local state
  const [display, setDisplayState] = useState<DisplaySettings>(readDisplay);
  const [session, setSession] = useState<Session | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<Shift | null>(null);
  const [pasteArmed, setPasteArmed] = useState(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [pasteBlocked, setPasteBlocked] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [topMenu, setTopMenu] = useState<TopMenu>(null);
  const [topSurface, setTopSurface] = useState<TopSurface>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [deleteAsk, setDeleteAsk] = useState<string[] | null>(null);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [folded, setFolded] = useState<Set<string> | null>(null);
  const toastSeq = useRef(0);
  const searchInput = useRef<HTMLInputElement | null>(null);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "error" ? 5200 : 3200);
  }, []);
  const dismissToast = (id: number) => setToasts((list) => list.filter((x) => x.id !== id));

  const setDisplay = (patch: Partial<DisplaySettings>) =>
    setDisplayState((current) => {
      const next = { ...current, ...patch };
      // Choosing Job/Position also turns Role separators on (rule 127).
      if (patch.sort === "job" && current.sort !== "job") next.separators = true;
      try {
        localStorage.setItem(displayKey, JSON.stringify(next));
      } catch {
        /* private window */
      }
      return next;
    });

  // ---- address
  const navigate = useCallback(
    (change: (draft: UrlDraft) => void, replace = false) => {
      setParams(
        (current) => {
          const draft = new UrlDraft(current);
          change(draft);
          return draft.params;
        },
        { replace },
      );
    },
    [setParams],
  );

  // ---- editing
  const editingHere = Boolean(url.editing && session && week && session.weekStart === week.weekStart);
  // A reload in edit mode picks the edit back up (rule 57); here: a fresh copy of the live week.
  useEffect(() => {
    if (url.editing && week && !session) {
      setSession({ weekStart: week.weekStart, locationIds: week.locations.map((l) => l.id), shifts: week.shifts, history: [], dirty: false });
    }
  }, [url.editing, week, session]);

  const shifts = useMemo(() => (editingHere ? session!.shifts : (week?.shifts ?? [])), [editingHere, session, week]);
  // Cards that just changed (a drop, a paste, a save) carry data-landed for a moment.
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const previousShifts = useRef<Map<string, Shift> | null>(null);
  useEffect(() => {
    const before = previousShifts.current;
    previousShifts.current = new Map(shifts.map((x) => [x.id, x]));
    if (!before || !editingHere) return;
    const changed = shifts.filter((x) => before.get(x.id) !== x).map((x) => x.id);
    if (!changed.length || changed.length > 20) return;
    setLanded(new Set(changed));
    const t = window.setTimeout(() => setLanded(new Set()), 700);
    return () => window.clearTimeout(t);
  }, [shifts, editingHere]);
  const shiftById = useCallback((id: string | null) => (id ? shifts.find((s) => s.id === id) : undefined), [shifts]);
  const pastWeek = week ? addDays(week.weekStart, 6) < today : false;

  const commit = useCallback(
    (next: (current: Shift[]) => Shift[]) => {
      setSession((current) =>
        current ? { ...current, history: [...current.history, current.shifts], shifts: next(current.shifts), dirty: true } : current,
      );
    },
    [],
  );

  const clearInteraction = useCallback(() => {
    setFocusId(null);
    setSelected([]);
    setClipboard(null);
    setPasteArmed(false);
    setMenu(null);
    setEditor(null);
  }, []);

  const startEdit = (source: "blank" | "live") => {
    if (!week) return;
    if (pastWeek) return;
    // The edit covers the location filter in force (rule 53).
    const scope = url.locations.length ? url.locations : week.locations.map((l) => l.id);
    setSession({
      weekStart: week.weekStart,
      locationIds: scope,
      shifts: source === "blank" ? week.shifts.filter((s) => !scope.includes(s.locationId)) : week.shifts,
      history: [],
      dirty: false,
    });
    clearInteraction();
    setTopSurface(null);
    // Entering edit wipes every filter, then puts a partial location scope back (rule 55).
    navigate((d) => {
      d.drop("layout", "q", "hideUnscheduled", "locations", "shiftTypes", "jobs", "employees").set("mode", "edit");
      if (scope.length < week.locations.length) d.set("locations", scope);
    });
  };

  const leaveEdit = () => {
    setSession(null);
    clearInteraction();
    setDiscardAsk(false);
    // Discard goes back to week view (rule 65).
    navigate((d) => d.drop("mode").set("view", "week"));
  };
  const requestDiscard = () => {
    if (session?.dirty) setDiscardAsk(true);
    else leaveEdit();
  };

  const undo = () => {
    if (!session?.history.length) return;
    setSession({ ...session, shifts: session.history.at(-1)!, history: session.history.slice(0, -1), dirty: true });
    toast({ tone: "info", title: "Last edit undone" });
  };

  // ---- grid
  const selectedDate = (() => {
    if (!week) return date;
    return date;
  })();
  const grid: GridModel | null = useMemo(
    () =>
      week
        ? buildGrid({ week, url, selectedDate, shifts, editing: editingHere, display, folded: folded ?? undefined })
        : null,
    [week, url, selectedDate, shifts, editingHere, display, folded],
  );

  // ---- focus = a filter (rule 76-78)
  const focusShift = (shift: Shift) => {
    setFocusId(shift.id);
    setSelected([]);
    setPasteArmed(false);
    setMenu(null);
    navigate((d) => {
      if (shift.shiftTypeId) d.set("shiftTypes", [shift.shiftTypeId]);
      else d.drop("shiftTypes");
      d.set("jobs", [shift.jobId]).drop("employees");
    });
  };
  const clearFocus = useCallback(
    (alsoSelection: boolean) => {
      setFocusId(null);
      if (alsoSelection) {
        setSelected([]);
        setMenu(null);
      }
      navigate((d) => d.drop(...FOCUS_KEYS));
    },
    [navigate],
  );
  // Focus ends when another change replaces its job or type filter (rule 78).
  // The address follows a moment after the click, so the check starts once
  // the address has shown the focus's own filters.
  const focusSeen = useRef(false);
  useEffect(() => {
    focusSeen.current = false;
  }, [focusId]);
  useEffect(() => {
    if (!focusId) return;
    const s = shiftById(focusId);
    const ok =
      s &&
      url.jobs.length === 1 &&
      url.jobs[0] === s.jobId &&
      (s.shiftTypeId ? url.shiftTypes.length === 1 && url.shiftTypes[0] === s.shiftTypeId : !url.shiftTypes.length);
    if (ok) focusSeen.current = true;
    else if (focusSeen.current) setFocusId(null);
  }, [focusId, url.jobs, url.shiftTypes, shiftById]);

  // ---- selection (rule 81)
  const toggleSelect = (shift: Shift) => {
    setSelected((current) => {
      const base = !current.length && focusId && focusId !== shift.id ? [focusId] : current;
      return base.includes(shift.id) ? base.filter((id) => id !== shift.id) : [...base, shift.id];
    });
  };

  // ---- copy & paste (§6)
  const showPasteNotice = (text: string) => {
    setPasteNotice(text);
    window.setTimeout(() => setPasteNotice((n) => (n === text ? null : n)), 500);
  };
  const copyShift = (shift: Shift) => {
    setClipboard(shift);
    setPasteArmed(true);
    setPasteBlocked(null);
    toast({ tone: "success", title: "Shift copied", body: "Paste mode is ready." });
  };
  const copySelection = (): boolean => {
    if (selected.length > 1) {
      toast({ tone: "info", title: "Select one shift to copy" });
      return false;
    }
    const s = shiftById(selected[0] ?? null);
    if (!s) return false;
    copyShift(s);
    return true;
  };
  const togglePaste = () => {
    if (!clipboard) {
      toast({ tone: "info", title: "Copy a shift first", body: "Paste mode needs a copied shift. Select one and press Ctrl+C." });
      return;
    }
    setPasteArmed((armed) => {
      if (armed) showPasteNotice("Paste mode off");
      else toast({ tone: "info", title: "Paste mode on", body: "Click a schedule cell to paste the copied shift." });
      return !armed;
    });
    setPasteBlocked(null);
  };
  const endPaste = () => {
    if (pasteArmed) showPasteNotice("Paste mode off");
    setPasteArmed(false);
  };
  const pasteInto = (target: Target) => {
    if (!week || !clipboard) return;
    const candidate = { ...clipboard, id: newId() };
    const result = assess({ week, shifts, candidate, target });
    if (result.status === "blocked") {
      setPasteBlocked(result.reason);
      setSheet({
        kind: "paste",
        title: "This paste was not applied",
        messages: result.messages,
        context: `${shiftTitle(week, clipboard, true)} → ${target.employeeId ? week.employees.find((e) => e.id === target.employeeId)?.name : "Open shifts"}, ${target.date}`,
      });
      toast({ tone: "error", title: "Paste blocked", body: result.messages[0] });
      return;
    }
    setPasteBlocked(null);
    commit((list) => [...list, { ...candidate, ...target, origin: "new", edited: false, removed: false }]);
    toast({ tone: "success", title: "Shift pasted", body: "The copied shift was added to the draft." });
  };

  // ---- delete (rule 83, 84)
  const requestDelete = (ids?: string[]) => {
    const targets = (ids ?? (selected.length ? selected : focusId ? [focusId] : [])).filter((id) => {
      const s = shiftById(id);
      return s && !s.removed;
    });
    if (!targets.length) return false;
    setDeleteAsk(targets);
    return true;
  };
  const removeShifts = (ids: string[]) => {
    commit((list) =>
      list
        .filter((s) => !(ids.includes(s.id) && s.origin === "new"))
        .map((s) => (ids.includes(s.id) ? { ...s, removed: true } : s)),
    );
    setSelected([]);
    setDeleteAsk(null);
    if (focusId && ids.includes(focusId)) setFocusId(null);
  };
  const restoreShift = (id: string) => commit((list) => list.map((s) => (s.id === id ? { ...s, removed: false } : s)));

  // ---- shift window (§10)
  const openEditor = (state: EditorState) => {
    setMenu(null);
    setEditor(state);
  };
  const saveShifts = (args: { shiftId: string | null; values: Omit<Shift, "id" | "origin">; count: number }) => {
    if (args.shiftId) {
      commit((list) =>
        list.map((s) => (s.id === args.shiftId ? { ...s, ...args.values, edited: s.origin === "live" ? true : s.edited } : s)),
      );
    } else {
      const made = Array.from({ length: Math.max(1, args.count) }, () => ({ ...args.values, id: newId(), origin: "new" as const }));
      commit((list) => [...list, ...made]);
    }
    setEditor(null);
  };

  // ---- one layer per press of Escape or of blank space (rule 111, 112)
  const dismissOne = (scope: "all" | "cell"): boolean => {
    if (topMenu) return setTopMenu(null), true;
    if (topSurface) return setTopSurface(null), true;
    if (drawer) return setDrawer(null), true;
    if (editor) return setEditor(null), setMenu(null), true;
    if (menu) return setMenu(null), true;
    if (pasteArmed || selected.length) {
      endPaste();
      setSelected([]);
      return true;
    }
    if (scope === "cell") return false;
    const newest: FilterKey | undefined = url.filterOrder.at(-1);
    if (newest) {
      if (focusId && (newest === "shiftTypes" || newest === "jobs")) {
        clearFocus(false);
      } else {
        navigate((d) => d.drop(newest));
      }
      return true;
    }
    if (url.view === "day") return navigate((d) => d.set("view", "week")), true;
    if (!url.editing && week && !isCurrentPeriod("week", date, week.weekStart, today)) {
      navigate((d) => d.set("date", today).set("view", "week"));
      return true;
    }
    return false;
  };

  // ---- keyboard (§12)
  const stateRef = useRef<Record<string, unknown>>({});
  stateRef.current = { dismissOne, requestDelete, undo, togglePaste, copySelection, editingHere, editor, sheet, deleteAsk, discardAsk, grid, focusId, shiftById, copyShift };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const st = stateRef.current as {
        dismissOne: typeof dismissOne;
        requestDelete: typeof requestDelete;
        undo: typeof undo;
        togglePaste: typeof togglePaste;
        copySelection: typeof copySelection;
        editingHere: boolean;
        editor: EditorState | null;
        sheet: Sheet;
        deleteAsk: string[] | null;
        discardAsk: boolean;
        grid: GridModel | null;
        focusId: string | null;
        shiftById: typeof shiftById;
        copyShift: typeof copyShift;
      };
      // Dialogs take their own keys first.
      if (st.deleteAsk || st.discardAsk || st.sheet) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const target = event.target as Element | null;
      if (event.key === "/" && !isTextTarget(target) && !st.editor && !document.querySelector("[data-proto-modal]")) {
        event.preventDefault();
        searchInput.current?.focus();
        searchInput.current?.select();
        return;
      }
      if (isTextTarget(target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        st.dismissOne("all");
        return;
      }
      // Grid shortcuts wait while the shift window or a dialog is open (BL-1003).
      if (st.editor || target?.closest?.("[role=dialog],[role=alertdialog],[aria-modal=true]")) return;
      const key = event.key.toLowerCase();
      if (ctrl && key === "a") {
        if (!target?.closest?.("[data-proto-page]")) return;
        event.preventDefault();
        window.getSelection()?.removeAllRanges();
        if (st.editingHere && st.grid?.visibleEditable.length) setSelected(st.grid.visibleEditable.map((s) => s.id));
        return;
      }
      if (event.key === "Delete" && st.editingHere) {
        if (st.requestDelete()) event.preventDefault();
        return;
      }
      if (ctrl && key === "z" && st.editingHere) {
        event.preventDefault();
        st.undo();
        return;
      }
      if (ctrl && key === "v" && st.editingHere) {
        event.preventDefault();
        st.togglePaste();
        return;
      }
      if (ctrl && key === "c" && st.editingHere) {
        const card = target?.closest?.("[data-proto-card]") as HTMLElement | null;
        if (card && !(stateRef.current as { selectedCount?: number }).selectedCount) {
          const s = st.shiftById(card.dataset.protoCard ?? null);
          if (s && !s.removed) {
            event.preventDefault();
            st.copyShift(s);
          }
          return;
        }
        if (st.copySelection()) event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  (stateRef.current as { selectedCount?: number }).selectedCount = selected.length;

  // ---- presses (§8)
  const spendNextClick = () => {
    const stop = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 600);
  };
  const pressRef = useRef<(event: PointerEvent) => void>(() => {});
  pressRef.current = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target || inLayer(target)) return;
    const inPage = Boolean(target.closest("[data-proto-page]"));
    const onGrid = Boolean(target.closest("[data-proto-grid]"));
    const spend = () => {
      event.preventDefault();
      spendNextClick();
    };
    // The shift window closes on an outside press, without asking (rule 119).
    if (editor) {
      setEditor(null);
      setMenu(null);
      if (inPage) spend();
      return;
    }
    if (menu) {
      setMenu(null);
      spend();
      return;
    }
    if (topMenu) {
      if (target.closest(`[data-proto-topmenu="${topMenu}"]`)) return;
      setTopMenu(null);
      if (onGrid) spend();
      return;
    }
    if (topSurface) {
      if (target.closest(`[data-proto-surface-trigger="${topSurface}"]`)) return;
      setTopSurface(null);
      spend();
      return;
    }
    if (!inPage) {
      setSelected([]);
      endPaste();
      setMenu(null);
      return;
    }
    const onCard = Boolean(target.closest("[data-proto-card]"));
    const cellish = !onCard && target.closest("[data-proto-cell],[data-proto-add],[data-proto-gridbg]");
    if (pasteArmed && target.closest("[data-proto-cell],[data-proto-add]")) return;
    if ((event.ctrlKey || event.metaKey || event.shiftKey) && target.closest("[data-proto-card]")) return;
    if (cellish) {
      const removed = dismissOne("cell");
      // A press on a cell body clears focus and its filters in read mode (rule 118).
      if (!editingHere && (focusId || url.shiftTypes.length || url.jobs.length || url.employees.length)) {
        clearFocus(false);
        return;
      }
      if (removed) spend();
      return;
    }
    const interactive = target.closest(
      "[data-proto-card],[data-proto-header],[data-proto-name],[data-proto-topbar],[data-proto-toolbar],[data-proto-interactive],button,a,input,label,select,textarea",
    );
    if (interactive) return;
    if (focusId) {
      clearFocus(editingHere);
      spend();
      return;
    }
    if (dismissOne("all")) spend();
  };
  useEffect(() => {
    const onDown = (event: PointerEvent) => pressRef.current(event);
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, []);

  // ---- drag (§5)
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const scrollerRef = useRef<HTMLElement | null>(null);
  const targetFromPoint = (x: number, y: number): { target: Target; key: string } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-proto-cell]");
    if (!el) return null;
    const { protoEmployee, protoLocation, protoDate, protoCell } = el.dataset;
    if (!protoLocation || !protoDate) return null;
    return { target: { employeeId: protoEmployee || null, locationId: protoLocation, date: protoDate }, key: protoCell ?? "" };
  };
  const startDrag = (shift: Shift, event: React.PointerEvent<HTMLElement>) => {
    if (!editingHere || !week || event.button !== 0 || event.altKey || shift.removed) return;
    // A drag of several selected shifts is not supported (rule 89).
    if (selected.length >= 2) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = event.currentTarget.getBoundingClientRect();
    let started = false;
    let frame = 0;
    const update = (e: PointerEvent) => {
      const copy = e.ctrlKey || e.metaKey || e.shiftKey;
      const hit = targetFromPoint(e.clientX, e.clientY);
      const own = Boolean(hit && !copy && hit.target.employeeId === shift.employeeId && hit.target.date === shift.date && hit.target.locationId === shift.locationId);
      const assessment = hit && !own ? assess({ week, shifts, candidate: shift, target: hit.target, ignoreId: copy ? null : shift.id }) : null;
      setDrag({
        shiftId: shift.id,
        copy,
        x: e.clientX,
        y: e.clientY,
        offsetX: startX - rect.left,
        offsetY: startY - rect.top,
        width: rect.width,
        height: rect.height,
        target: hit?.target ?? null,
        targetCellKey: own ? null : (hit?.key ?? null),
        own,
        assessment,
      });
      // Scroll near an edge (rule 95).
      const scroller = scrollerRef.current;
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        const dx = e.clientX < box.left + 56 ? -18 : e.clientX > box.right - 56 ? 18 : 0;
        const dy = e.clientY < box.top + 56 ? -18 : e.clientY > box.bottom - 56 ? 18 : 0;
        if (dx || dy) scroller.scrollBy(dx, dy);
      }
    };
    const move = (e: PointerEvent) => {
      if (!started) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        started = true;
        // No text selection while a card is carried.
        window.getSelection()?.removeAllRanges();
        document.documentElement.style.userSelect = "none";
        setFocusId(null);
        window.clearTimeout(clickTimer.current);
        frame = requestAnimationFrame(() => setFolded(foldedFor(week, shifts, shift, grid?.dates ?? [shift.date])));
      }
      update(e);
    };
    const finish = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      cancelAnimationFrame(frame);
      document.documentElement.style.userSelect = "";
      if (!started) return;
      spendNextClick();
      const state = dragRef.current;
      setDrag(null);
      requestAnimationFrame(() => setFolded(null));
      if (!state || !state.target || state.own) return;
      const copy = e.ctrlKey || e.metaKey || e.shiftKey || state.copy;
      const a = assess({ week, shifts, candidate: shift, target: state.target, ignoreId: copy ? null : shift.id });
      const apply = () => {
        commit((list) =>
          copy
            ? [...list, { ...shift, ...state.target!, id: newId(), origin: "new", edited: false, removed: false }]
            : list.map((s) => (s.id === shift.id ? { ...s, ...state.target!, edited: s.origin === "live" ? true : s.edited } : s)),
        );
        setSheet(null);
      };
      if (a.status === "blocked") {
        toast({ tone: "error", title: "This assignment cannot be saved", body: a.messages.join(" ") });
        return;
      }
      if (a.status === "warning") {
        setSheet({ kind: "drop", title: "Schedule this shift anyway?", messages: a.messages, apply });
        return;
      }
      apply();
    };
    const cancel = () => {
      document.documentElement.style.userSelect = "";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      setDrag(null);
      setFolded(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
  };

  // ---- element handlers
  const clickTimer = useRef<number>(0);
  const closeSurfacesFirst = () => {
    // Grid actions first close an open top surface; that click does nothing else (rule 120).
    if (topSurface) {
      setTopSurface(null);
      return true;
    }
    return false;
  };

  const cardProps = (shift: Shift) => ({
    "data-proto-card": shift.id,
    "data-selected": selected.includes(shift.id) || undefined,
    "data-focused": focusId === shift.id || undefined,
    "data-current": editor?.shiftId === shift.id || undefined,
    "data-removed": shift.removed || undefined,
    "data-dragging": drag?.shiftId === shift.id || undefined,
    "data-landed": landed.has(shift.id) || undefined,
    tabIndex: 0,
    role: "button",
    "aria-pressed": selected.includes(shift.id),
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (editingHere && (event.ctrlKey || event.metaKey || event.shiftKey)) {
        event.preventDefault();
        toggleSelect(shift);
      }
      startDrag(shift, event);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (closeSurfacesFirst()) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (editingHere) {
        (event.currentTarget as HTMLElement).focus({ preventScroll: true });
        if (event.detail > 1) {
          window.clearTimeout(clickTimer.current);
          return;
        }
        window.clearTimeout(clickTimer.current);
        clickTimer.current = window.setTimeout(() => {
          if (focusId === shift.id) clearFocus(true);
          else focusShift(shift);
        }, 250);
        return;
      }
      if (focusId === shift.id) clearFocus(false);
      else focusShift(shift);
    },
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
      window.clearTimeout(clickTimer.current);
      if (!editingHere || shift.removed) return;
      event.preventDefault();
      openEditor({ mode: "edit", shiftId: shift.id, target: { employeeId: shift.employeeId, locationId: shift.locationId, date: shift.date }, anchor: { x: event.clientX, y: event.clientY } });
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" && editingHere && !shift.removed) {
        window.clearTimeout(clickTimer.current);
        const r = event.currentTarget.getBoundingClientRect();
        openEditor({ mode: "edit", shiftId: shift.id, target: { employeeId: shift.employeeId, locationId: shift.locationId, date: shift.date }, anchor: { x: r.right, y: r.top } });
      }
    },
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      if (!editingHere) return;
      event.preventDefault();
      event.stopPropagation();
      if (!selected.includes(shift.id)) setSelected([shift.id]);
      setMenu({ kind: "card", shiftId: shift.id, x: event.clientX, y: event.clientY });
    },
  });

  const targetOf = (row: Row, column: Column): Target | null => {
    if (row.kind === "group") return null;
    return {
      employeeId: row.kind === "person" ? row.employee.id : null,
      locationId:
        url.layout === "unified" && clipboard && column.locationIds.includes(clipboard.locationId) ? clipboard.locationId : (column.locationIds[0] ?? ""),
      date: column.date,
    };
  };

  const cellProps = (row: Row, column: Column) => {
    const target = targetOf(row, column);
    const key = `${row.key}|${column.key}`;
    const status = drag && drag.targetCellKey === key ? (drag.assessment?.status ?? null) : null;
    const closed = week?.closures.find((c) => c.date === column.date && column.locationIds.includes(c.locationId) && c.kind === "closed");
    return {
      "data-proto-cell": key,
      "data-proto-employee": target?.employeeId ?? "",
      "data-proto-location": target?.locationId,
      "data-proto-date": column.date,
      "data-drop": status ?? undefined,
      "data-closed": closed ? true : undefined,
      title: closed?.title,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!target || !editingHere) return;
        // A card's own click is not a press on the cell body (rule 104).
        if ((event.target as Element).closest("[data-proto-card]")) return;
        if (pasteArmed) {
          event.preventDefault();
          pasteInto(target);
        }
      },
      onDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!target || !editingHere || pasteArmed) return;
        if ((event.target as Element).closest("[data-proto-card]")) return;
        openEditor({ mode: "add", shiftId: null, target, anchor: { x: event.clientX, y: event.clientY } });
      },
      onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
        if (!target || !editingHere) return;
        event.preventDefault();
        setMenu({ kind: "cell", target, x: event.clientX, y: event.clientY });
      },
    };
  };

  const addProps = (row: Row, column: Column) => {
    const target = targetOf(row, column);
    const name = row.kind === "person" ? row.employee.name : "unassigned";
    const loc = week?.locations.find((l) => l.id === target?.locationId)?.name ?? "";
    return {
      "data-proto-add": true,
      type: "button" as const,
      "aria-label": `Add shift for ${name} at ${loc} on ${column.date}`,
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!target) return;
        event.stopPropagation();
        if (pasteArmed) return pasteInto(target);
        const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
        openEditor({ mode: "add", shiftId: null, target, anchor: { x: r.right, y: r.top } });
      },
    };
  };

  const dayHeaderProps = (column: Column) => ({
    "data-proto-header": "day",
    tabIndex: 0,
    role: "button",
    onClick: () => dayHeaderPress(column),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        dayHeaderPress(column);
      }
    },
  });
  const dayHeaderPress = (column: Column) => {
    if (closeSurfacesFirst()) return;
    if (url.view === "week") {
      navigate((d) => d.set("view", "day").set("date", column.date).set("locations", column.locationIds));
    } else if (url.layout === "separate") {
      setFocusId(null);
      navigate((d) => d.set("locations", column.locationIds));
    }
  };
  const locationHeaderProps = (group: ColumnGroup) => ({
    "data-proto-header": "location",
    tabIndex: 0,
    role: "button",
    onClick: () => locationPress(group.locationIds),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        locationPress(group.locationIds);
      }
    },
  });
  const locationPress = (ids: string[]) => {
    if (closeSurfacesFirst()) return;
    const same = ids.length === url.locations.length && ids.every((id) => url.locations.includes(id));
    if (same) return;
    setFocusId(null);
    navigate((d) => d.set("locations", ids));
  };
  const nameProps = (employee: Employee) => ({
    "data-proto-name": true,
    type: "button" as const,
    onClick: () => {
      if (closeSurfacesFirst()) return;
      setEditor(null);
      setMenu(null);
      setDrawer(employee.id);
    },
  });

  // ---- top bar
  const step = (direction: 1 | -1) =>
    navigate((d) => d.set("date", addDays(date, direction * (url.view === "day" ? 1 : 7))));
  const onCurrentPeriod = week ? isCurrentPeriod(url.view, date, week.weekStart, today) : true;
  const datePress = () => {
    if (onCurrentPeriod) setTopMenu((m) => (m === "calendar" ? null : "calendar"));
    else navigate((d) => d.set("date", today));
  };
  const setView = (view: "week" | "day") => {
    if (view === url.view || !week) return;
    if (view === "day") {
      // The selected date if it is in the shown week, else today if this is the current week, else the first day (rule 8).
      const inWeek = date >= week.weekStart && date <= addDays(week.weekStart, 6);
      const day = inWeek ? date : isCurrentPeriod("week", date, week.weekStart, today) ? today : week.weekStart;
      navigate((d) => d.set("view", "day").set("date", day));
    } else navigate((d) => d.set("view", "week"));
  };
  const pickDate = (picked: string) => {
    setTopMenu(null);
    navigate((d) => d.set("date", picked));
  };

  const filterIds = (key: "locations" | "shiftTypes" | "jobs" | "employees") =>
    !week
      ? []
      : key === "locations"
        ? week.locations.map((l) => l.id)
        : key === "shiftTypes"
          ? week.shiftTypes.map((t) => t.id)
          : key === "jobs"
            ? week.jobs.map((j) => j.id)
            : week.employees.map((e) => e.id);
  const setFilter = (key: "locations" | "shiftTypes" | "jobs" | "employees", ids: string[]) => {
    const all = filterIds(key);
    const next = ids.length === 0 || ids.length >= all.length ? null : ids;
    navigate((d) => d.set(key, next));
  };
  // From "All", clicking one item selects only it (rule 122).
  const toggleFilter = (key: "locations" | "shiftTypes" | "jobs" | "employees", id: string) => {
    const current = url[key];
    if (!current.length) return setFilter(key, [id]);
    setFilter(key, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };
  const toggleFilterGroup = (key: "jobs", ids: string[]) => {
    const current = url[key];
    const allOn = ids.every((id) => current.includes(id));
    if (!current.length) return setFilter(key, ids);
    setFilter(key, allOn ? current.filter((x) => !ids.includes(x)) : [...new Set([...current, ...ids])]);
  };
  const filterSummary = (key: "locations" | "shiftTypes" | "jobs" | "employees") => {
    const nouns = { locations: ["location", "locations"], shiftTypes: ["shift", "shifts"], jobs: ["job", "jobs"], employees: ["employee", "employees"] }[key];
    const ids = url[key];
    if (!ids.length) return key === "locations" ? `All locations - ${url.layout === "unified" ? "Merged" : "Separate"}` : `All ${nouns[1]}`;
    if (ids.length === 1 && week) {
      const name =
        key === "locations" ? week.locations.find((x) => x.id === ids[0])?.name
        : key === "shiftTypes" ? week.shiftTypes.find((x) => x.id === ids[0])?.name
        : key === "jobs" ? week.jobs.find((x) => x.id === ids[0])?.name
        : week.employees.find((x) => x.id === ids[0])?.name;
      return name ?? `1 ${nouns[0]}`;
    }
    return `${ids.length} ${nouns[1]}`;
  };
  const chips = useMemo(() => {
    if (!week) return [];
    const out: { key: "locations" | "shiftTypes" | "jobs" | "employees"; id: string; label: string; color?: string }[] = [];
    for (const id of url.locations) out.push({ key: "locations", id, label: week.locations.find((l) => l.id === id)?.name ?? id });
    for (const id of url.shiftTypes) out.push({ key: "shiftTypes", id, label: typeOf(week, id)?.name ?? id, color: typeOf(week, id)?.color });
    for (const id of url.jobs) out.push({ key: "jobs", id, label: jobOf(week, id)?.name ?? id });
    for (const id of url.employees) out.push({ key: "employees", id, label: week.employees.find((e) => e.id === id)?.name ?? id });
    return out;
  }, [week, url]);
  const removeChip = (key: "locations" | "shiftTypes" | "jobs" | "employees", id: string) => {
    if (focusId && (key === "jobs" || key === "shiftTypes")) setFocusId(null);
    setFilter(key, url[key].filter((x) => x !== id));
  };

  const [searchText, setSearchText] = useState(url.q);
  useEffect(() => setSearchText(url.q), [url.q]);
  useEffect(() => {
    if (searchText === url.q) return;
    const t = window.setTimeout(() => navigate((d) => d.set("q", searchText || null), true), 150);
    return () => window.clearTimeout(t);
  }, [searchText, url.q, navigate]);
  const searchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (searchText) {
      setSearchText("");
      navigate((d) => d.drop("q"), true);
    } else event.currentTarget.blur();
  };

  return {
    // data
    week,
    loading: query.isPending,
    error: query.error ? String(query.error) : null,
    url,
    date,
    today,
    grid,
    shifts,
    display,
    setDisplay,
    // edit
    editing: editingHere,
    editRequested: url.editing,
    session,
    pastWeek,
    startEdit,
    requestDiscard,
    leaveEdit,
    discardAsk,
    setDiscardAsk,
    undo,
    canUndo: Boolean(session?.history.length),
    // interaction
    focusId,
    selected,
    clipboard,
    pasteArmed,
    pasteNotice,
    pasteBlocked,
    togglePaste,
    copyShift,
    pasteInto,
    menu,
    setMenu,
    editor,
    setEditor,
    openEditor,
    saveShifts,
    topMenu,
    setTopMenu,
    topSurface,
    setTopSurface,
    drawer,
    setDrawer,
    sheet,
    setSheet,
    deleteAsk,
    setDeleteAsk,
    requestDelete,
    removeShifts,
    restoreShift,
    toasts,
    toast,
    dismissToast,
    drag,
    scrollerRef,
    // element wiring
    cardProps,
    cellProps,
    addProps,
    dayHeaderProps,
    locationHeaderProps,
    nameProps,
    // top bar
    step,
    datePress,
    onCurrentPeriod,
    setView,
    pickDate,
    toggleFilter,
    toggleFilterGroup,
    setFilter,
    filterSummary,
    chips,
    removeChip,
    toggleHideUnscheduled: () => navigate((d) => d.set("hideUnscheduled", url.hideUnscheduled ? null : true)),
    setLayout: (layout: "separate" | "unified") => navigate((d) => d.set("layout", layout === "unified" ? "unified" : null)),
    searchText,
    setSearchText,
    searchKeyDown,
    searchInput,
    clearSearch: () => {
      setSearchText("");
      navigate((d) => d.drop("q"), true);
    },
    showAllFilters: () => navigate((d) => d.drop("locations", "shiftTypes", "jobs", "employees")),
    // helpers for drawing
    titleOf: (shift: Shift) => (week ? shiftTitle(week, shift, display.showType) : ""),
    jobOf: (id: string | null) => (week ? jobOf(week, id) : undefined),
    typeOf: (id: string | null) => (week ? typeOf(week, id) : undefined),
    scheduleJobOf: (e: Employee) => (week ? scheduleJobOf(week, e) : null),
    shiftById,
  };
}

export type Schedule = ReturnType<typeof useScheduleController>;
export type { UrlState };

const ScheduleContext = createContext<Schedule | null>(null);

export function ScheduleProvider({ children }: { children: (schedule: Schedule) => ReactNode }) {
  const schedule = useScheduleController();
  return <ScheduleContext.Provider value={schedule}>{children(schedule)}</ScheduleContext.Provider>;
}

export function useSchedule(): Schedule {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useSchedule outside ScheduleProvider");
  return value;
}
