import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { getLineupOffers, respondToLineupOffer } from "../lineup-data";
import { formatLineupInterval } from "./lineup-time";
import "./employee-lineup-offers.css";

type Offers = Awaited<ReturnType<typeof getLineupOffers>>;

export function EmployeeLineupOffers({
  workspaceId,
  showLineupLink = false,
  timeFormat = "24h",
}: {
  workspaceId: string;
  showLineupLink?: boolean;
  timeFormat?: "12h" | "24h";
}) {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const target = params.get("staffing_offer");
  const queryKey = ["lineup-offers", workspaceId];
  const query = useQuery({
    queryKey,
    queryFn: () => getLineupOffers(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
    refetchOnReconnect: "always",
  });
  const lock = useRef(false);
  const focusedTarget = useRef<string | null>(null);
  const targetRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const offers = query.data ?? [];
  const targetMissing = Boolean(
    target && query.isSuccess && !offers.some((offer) => offer.id === target),
  );
  useEffect(() => {
    if (!target || query.isPending || focusedTarget.current === target) return;
    const element = targetRef.current;
    if (element) {
      element.focus();
      focusedTarget.current = target;
    }
  }, [target, query.isPending, query.isSuccess, targetMissing]);

  async function respond(
    offer: Offers[number],
    response: "accept" | "decline",
  ) {
    if (
      lock.current ||
      query.isFetching ||
      query.isError ||
      error ||
      offer.status !== "pending"
    )
      return;
    lock.current = true;
    setBusy(offer.id);
    setError("");
    setNotice("");
    try {
      if (response === "accept" && offer.availability_warning) {
        await respondToLineupOffer(
          workspaceId,
          offer.id,
          response,
          offer.availability_warning.fingerprint,
        );
      } else {
        await respondToLineupOffer(workspaceId, offer.id, response);
      }
      // Only update after a confirmed server response. A failed refresh must
      // not offer a second acceptance or turn a saved response into a failure.
      client.setQueryData<Offers>(queryKey, (current) =>
        response === "decline"
          ? current?.filter((item) => item.id !== offer.id)
          : current?.map((item) =>
              item.id === offer.id ? { ...item, status: "accepted" } : item,
            ),
      );
      setNotice(
        response === "accept"
          ? "Offer accepted. Awaiting manager confirmation; it is not on your schedule yet."
          : "Offer declined. Your schedule has not changed.",
      );
      await Promise.all(
        [
          "lineup-offers",
          "lineup-proposals",
          "employee-hub",
          "notifications",
          "inbox",
        ].map((prefix) =>
          client.invalidateQueries({
            predicate: (item) =>
              item.queryKey[0] === prefix &&
              item.queryKey.includes(workspaceId),
          }),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save your response. Refresh the offers before trying again.",
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  useEffect(() => {
    // Acceptance/decline can remove the focused button. Keep keyboard users
    // at the confirmed outcome without stealing focus from another control.
    if (notice && !busy && document.activeElement === document.body)
      resultRef.current?.focus();
  }, [notice, busy]);

  if (
    !offers.length &&
    !query.isPending &&
    !query.error &&
    !notice &&
    !targetMissing
  )
    return null;
  return (
    <section className="lu-staffing-offers" aria-label="Manager shift offers">
      <header>
        <span>FROM YOUR MANAGER</span>
        <h2>Shift offers</h2>
        <p>
          Accepting tells your manager you are interested. Your schedule changes
          only after manager confirmation.
        </p>
      </header>
      {query.isPending && <p role="status">Loading shift offers…</p>}
      {notice && (
        <p
          className="lu-offer-notice"
          role="status"
          tabIndex={-1}
          ref={resultRef}
        >
          {notice}
        </p>
      )}
      {targetMissing && !notice && (
        <article tabIndex={-1} ref={targetRef}>
          <h3>This offer is no longer awaiting your response</h3>
          <p>
            It may have closed or been confirmed. Check your current Schedule
            for your assignment.
          </p>
          <Link to="/app/employee-hub/schedule">View my schedule</Link>
        </article>
      )}
      {offers.map((offer) => (
        <article
          key={offer.id}
          tabIndex={-1}
          ref={target === offer.id ? targetRef : undefined}
          aria-label={`${offer.job_name} at ${offer.location_name}, ${offer.date}`}
        >
          <div className="lu-offer-heading">
            <h3>{offer.job_name}</h3>
            <span className="lu-offer-status">
              {offer.status === "accepted"
                ? "Awaiting manager"
                : offer.status === "pending"
                  ? "Your response needed"
                  : "Offer updated"}
            </span>
          </div>
          <p>
            {offer.location_name} · {offer.date}
          </p>
          <strong>
            {formatLineupInterval(offer, timeFormat, offer.date, "UTC")}
          </strong>
          {offer.status === "accepted" && (
            <p>Accepted · Not added to your schedule yet</p>
          )}
          {offer.status === "pending" && offer.availability_warning && (
            <p className="lu-offer-availability-warning">
              This shift conflicts with your availability. Accepting it will not
              change your weekly preferences.
            </p>
          )}
          {offer.status === "pending" && (
            <div className="lu-staffing-actions">
              <button
                type="button"
                className="lu-offer-primary"
                disabled={
                  Boolean(busy) ||
                  query.isFetching ||
                  query.isError ||
                  Boolean(error)
                }
                onClick={() => void respond(offer, "accept")}
              >
                {busy === offer.id
                  ? "Saving response…"
                  : offer.availability_warning
                    ? "Accept anyway"
                    : "Accept offer"}
              </button>
              <button
                type="button"
                disabled={
                  Boolean(busy) ||
                  query.isFetching ||
                  query.isError ||
                  Boolean(error)
                }
                onClick={() => void respond(offer, "decline")}
              >
                Decline
              </button>
            </div>
          )}
          {showLineupLink && (
            <Link
              to={`/app/employee-hub/lineup?staffing_offer=${encodeURIComponent(offer.id)}`}
            >
              View in Line Up
            </Link>
          )}
        </article>
      ))}
      {(error || query.error) && (
        <div className="lu-offer-error" role="alert">
          <p>
            {error ||
              "Shift offers could not be refreshed. Your last saved response is unchanged."}
          </p>
          <button
            type="button"
            disabled={query.isFetching || Boolean(busy)}
            onClick={() => {
              setError("");
              void query.refetch();
            }}
          >
            {query.isFetching ? "Refreshing…" : "Refresh offers"}
          </button>
        </div>
      )}
    </section>
  );
}
