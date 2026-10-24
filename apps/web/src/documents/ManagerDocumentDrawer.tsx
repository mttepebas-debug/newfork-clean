import type { DocumentObligation } from "@newfork/shared";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef, useState, type Ref } from "react";
import { isNoAccess } from "../lib/no-access";
import { useListPhoneWidth } from "../lib/usePhoneWidth";
import { CatalogDrawer } from "../settings/CatalogDrawer";
import { LinesOutline, LoadError } from "../shell/LoadState";
import { RequestDrawer, type DrawerTab } from "../views/RequestDrawer";
import { documentQueryKey, getDocument, type DocumentAudience } from "./document-data";
import { headSub, shownVersion } from "./document-review-facts";
import { initials, statusLabel, statusTone } from "./document-rules";
import { ManagerDocumentContent, type ManagerTab } from "./ManagerDocumentContent";
import { neighbours, queueLabel } from "./review-queue";
import { createReviewSitting, type ReviewSitting } from "./review-sitting";
import "./document-review-drawer.css";

// Employees → Documents, a row (and the Documents section of the Employee drawer): the manager's review drawer,
// A2 Tur 6 with file buttons design a (Mert 23 Oct, "Görsel olarak herşey harika … direk implement edebilirsin").
// Only the look and the order change; approve, reject, excuse and extend keep today's rules (K1).
//
// One drawer stays open while it walks the list: CatalogDrawer (inert page, focus, Escape, Tab) and RequestDrawer
// (head, tabs, body, footer) sit above the document, so a move never slides the drawer in again. The strip above the
// head walks the rows the list showed when the drawer opened; moving slides the person, the tabs and the body in
// from the side of travel, and keeps the strip, the X and the dock where they are.

export type ManagerDrawerProps = {
  audience: DocumentAudience;
  userId: string;
  requirementId: string;
  canReview: boolean;
  onClose: () => void;
  /** The list's rows the drawer walks, in the order they were shown, with their latest data (K1 decision 6). */
  queue?: readonly DocumentObligation[];
  /** Opens another row of the queue in this drawer. */
  onOpen?: (requirementId: string) => void;
  /** The page's drafts and answers (K1 decision 5); the drawer keeps its own while open when none is given. */
  sitting?: ReviewSitting;
};

type Named = Pick<DocumentObligation, "id" | "employee_id" | "employee_name" | "title">;

export function ManagerDocumentDrawer(props: ManagerDrawerProps) {
  const { requirementId } = props;
  const phone = useListPhoneWidth();
  const [ownSitting] = useState(createReviewSitting);
  const sitting = props.sitting ?? ownSitting;
  const query = useQuery({
    queryKey: documentQueryKey(props.audience, props.userId, requirementId),
    queryFn: () => getDocument(props.audience, requirementId),
  });
  const queue = props.queue ?? [];
  const row = queue.find((item) => item.id === requirementId);
  const detail = query.data?.obligation.id === requirementId ? query.data : undefined;
  // The head speaks from the list's row until the document arrives, so a move never leaves it blank.
  const obligation = detail?.obligation ?? row;
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const [said, setSaid] = useState("");
  const strip = useRef<HTMLDivElement>(null);
  // Each document opens on Details; a tab chosen for one is not carried to the next.
  const [chosen, setChosen] = useState<{ id: string; tab: ManagerTab }>({ id: requirementId, tab: "details" });
  const files = detail ? (shownVersion(detail)?.files.length ?? 0) : 0;
  const wanted = chosen.id === requirementId ? chosen.tab : "details";
  // A desktop has the files inside Details; a phone has its Files tab only when there are files.
  const tab: ManagerTab = wanted === "files" && (!phone || !files) ? "details" : wanted;
  const focusTab = useRef<ManagerTab | null>(null);
  const body = () => strip.current?.closest(".rd")?.querySelector<HTMLElement>(".rd-body") ?? null;
  const choose = (key: ManagerTab) => {
    setChosen({ id: requirementId, tab: key });
    const scroller = body();
    if (scroller) scroller.scrollTop = 0;
  };
  const showFiles = () => {
    focusTab.current = "files";
    choose("files");
  };
  useLayoutEffect(() => {
    const key = focusTab.current;
    if (!key) return;
    focusTab.current = null;
    strip.current
      ?.closest(".rd")
      ?.querySelector<HTMLElement>(`.rd-tabs [data-tab="${key}"]`)
      ?.focus({ preventScroll: true });
  });

  // A move: the person, the tabs and the body come in from the side of travel (forward from the right, back from
  // the left, 220 ms; a short fade under reduced motion), the body starts at its top, and the move is said.
  const shown = useRef(requirementId);
  const saying = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const from = shown.current;
    if (from === requirementId) return;
    shown.current = requirementId;
    const order = (id: string) => queue.findIndex((item) => item.id === id);
    const forward = order(requirementId) >= order(from);
    const rd = strip.current?.closest(".rd");
    const scroller = body();
    if (scroller) scroller.scrollTop = 0;
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const frames = calm
      ? [{ opacity: 0.2 }, { opacity: 1 }]
      : [
          { opacity: 0.2, transform: `translateX(${forward ? 24 : -24}px)` },
          { opacity: 1, transform: "none" },
        ];
    for (const part of [".rd-head-row", ".rd-tabs", ".rd-body"])
      rd?.querySelector<HTMLElement>(part)?.animate?.(frames, { duration: calm ? 120 : 220, easing: "ease-out" });
    if (obligation) {
      const text = `${obligation.employee_name} · ${obligation.title}`;
      setSaid("");
      window.clearTimeout(saying.current);
      saying.current = window.setTimeout(() => setSaid(text), 50);
    }
  }, [requirementId]); // eslint-disable-line react-hooks/exhaustive-deps -- runs once per move
  useLayoutEffect(() => () => window.clearTimeout(saying.current), []);

  const onBusy = useCallback((value: boolean) => setBusy(value), []);
  const onAlert = useCallback((value: string | null) => setAlert(value), []);
  const { previous, next } = neighbours(queue, requirementId);
  const tabs: DrawerTab<ManagerTab>[] = [
    { key: "details", label: "Details" },
    ...(phone && files
      ? [{ key: "files" as const, label: "Files", count: files, name: `Files, ${files} ${files === 1 ? "file" : "files"}` }]
      : []),
    { key: "history", label: "History" },
  ];
  const sub = obligation ? (headSub(obligation, detail, { phone, now: new Date() }) ?? " ") : undefined;

  return (
    <CatalogDrawer
      label={obligation ? `${obligation.employee_name} · ${obligation.title}` : "Document details"}
      className="requests-review-drawer document-review-drawer"
      busy={busy}
      backdropGrace={500}
      onClose={props.onClose}
    >
      <RequestDrawer<ManagerTab>
        strip={
          <ReviewStrip
            ref={strip}
            current={obligation}
            previous={previous}
            next={next}
            busy={busy}
            said={said}
            onMove={(id) => props.onOpen?.(id)}
            onClose={props.onClose}
          />
        }
        focusTitle
        icon={
          obligation ? (
            <span className="docr-avatar" aria-hidden="true">
              {initials(obligation.employee_name)}
            </span>
          ) : undefined
        }
        title={obligation?.employee_name ?? "Document details"}
        status={
          obligation
            ? { label: statusLabel(obligation, "manager"), tone: statusTone(obligation) }
            : undefined
        }
        kicker={obligation?.title}
        sub={sub}
        tabs={tabs}
        tab={tab}
        onTab={choose}
        tabsLabel="Document sections"
        homeEndTabs
        onClose={props.onClose}
        closeRefused={busy}
        footer={<div className="docr-dock" ref={setDock} />}
        footerAlert={alert}
      >
        {detail ? (
          <ManagerDocumentContent
            key={requirementId}
            audience={props.audience}
            userId={props.userId}
            detail={detail}
            canReview={props.canReview}
            tab={tab}
            phone={phone}
            sitting={sitting}
            dock={dock}
            onBusy={onBusy}
            onAlert={onAlert}
            onShowFiles={showFiles}
          />
        ) : !query.error ? (
          <LinesOutline label="Loading document" lines={5} />
        ) : isNoAccess(query.error) ? (
          <p role="alert">You don't have access to this document.</p>
        ) : (
          <LoadError
            inset
            level={3}
            title="We couldn't load this document"
            detail="This document didn't load. Nothing was changed."
            retrying={query.isFetching}
            onRetry={() => void query.refetch()}
          />
        )}
      </RequestDrawer>
    </CatalogDrawer>
  );
}

/**
 * Above the head, on its sky: the row before and the row after, each named by its person (or by its document when
 * it is the same person's), and the X. No counter, nothing between them. At an end the word stays, faint, and does
 * nothing (mockup-spec 1).
 */
function ReviewStrip({
  ref,
  current,
  previous,
  next,
  busy,
  said,
  onMove,
  onClose,
}: {
  ref: Ref<HTMLDivElement>;
  current: Named | undefined;
  previous: Named | null;
  next: Named | null;
  busy: boolean;
  said: string;
  onMove: (id: string) => void;
  onClose: () => void;
}) {
  const id = useId();
  const side = (dir: "previous" | "next", neighbour: Named | null) => {
    const word = dir === "previous" ? "Previous" : "Next";
    const icon =
      dir === "previous" ? (
        <ChevronLeft size={16} aria-hidden className="docr-strip-icon" />
      ) : (
        <ChevronRight size={16} aria-hidden className="docr-strip-icon" />
      );
    const label = neighbour ? queueLabel(neighbour, current ?? { employee_id: "" }) : word;
    const named = neighbour !== null && label !== neighbour.title;
    const text = <span className={neighbour ? "docr-strip-name" : "docr-strip-word"}>{label}</span>;
    return (
      <>
        <button
          type="button"
          className={`docr-strip-btn docr-strip-${dir}${neighbour ? "" : " is-end"}`}
          aria-label={neighbour ? `${word}: ${label}` : word}
          aria-disabled={neighbour ? undefined : "true"}
          aria-describedby={named ? `${id}-${dir}` : undefined}
          title={neighbour ? `${word}: ${label}${named ? ` · ${neighbour.title}` : ""}` : undefined}
          disabled={neighbour !== null && busy}
          onClick={() => {
            if (neighbour) onMove(neighbour.id);
          }}
        >
          {dir === "previous" ? (
            <>
              {icon}
              {text}
            </>
          ) : (
            <>
              {text}
              {icon}
            </>
          )}
        </button>
        {named ? (
          <span hidden id={`${id}-${dir}`}>
            {neighbour.title}
          </span>
        ) : null}
      </>
    );
  };
  return (
    <div className="docr-strip" ref={ref}>
      <nav className="docr-strip-nav" aria-label="Documents in this list">
        {side("previous", previous)}
        {side("next", next)}
      </nav>
      <button type="button" className="rd-close" aria-label="Close details" disabled={busy} onClick={onClose}>
        <X size={18} aria-hidden />
      </button>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {said}
      </span>
    </div>
  );
}
