import { Button, useToast } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthContext";
import { loadNotificationPreferences, notificationPreferencesKey } from "../notification-settings/notification-settings-data";
import { AlertsOn, BlockedHelp, NotAsked, OpenInSafari, deviceWord, type Outcome } from "./AlertsOutcome";
import { useNotificationChannels } from "./channels-data";
import { GuideStrip, HomeScreenGuide, ReturnCard, guideStartedAt, useGuideFlow, type GuideBrowser } from "./guide/HomeScreenGuide";
import { nfIcon } from "./guide/replica";
import { cardDismissed, dismissCard, firstHomeOpening, quiet, quietForThreeDays } from "./home-card-memory";
import { phoneAlertsSupport, readInstallEnv } from "./install-state";
import { markSetupAddress } from "./setup-link";
import { showTestAlert } from "./push-client";
import { usePhoneAlerts } from "./use-phone-alerts";
import "./home-entry.css";

// The employee's phone alerts entry on Home (TELEFON-TUR2, V1-F and V1-H; K26). One per opening: on the
// first Home of this device, a thin offer right under "Your day" (`place="first"`); after that, the block
// under Updates (`place="block"`). The guide's strip and return card take the slot of the entry that
// opened them. Turning on happens only from a tap (K5); the result stays inside the card.

type Place = "first" | "block";

function useEntryState(place: Place) {
  const { context } = useAuth();
  const config = useNotificationChannels();
  const alerts = usePhoneAlerts();
  const [isFirst] = useState(firstHomeOpening);
  const [hidden, setHidden] = useState(() => quiet() || (place === "block" && cardDismissed()));
  const workspaceId = context?.workspace.id ?? "";
  const mine = isFirst ? place === "first" : place === "block";
  const offering =
    alerts.state === "off" || alerts.state === "needs-install" || alerts.state === "other" || (place === "block" && alerts.state === "blocked");
  const asking = mine && !hidden && config.push.available && offering;
  const preferences = useQuery({
    queryKey: notificationPreferencesKey(workspaceId),
    queryFn: () => loadNotificationPreferences(workspaceId),
    enabled: asking && Boolean(workspaceId),
  });
  return {
    alerts,
    publicKey: config.push.public_key,
    show: asking && Boolean(preferences.data?.channels.push.workspace_enabled),
    hide: () => setHidden(true),
  };
}

export function EmployeeAlertsEntry({ place, hasShifts }: { readonly place: Place; readonly hasShifts: boolean }) {
  const titleId = useId();
  const toast = useToast();
  const { alerts, publicKey, show, hide } = useEntryState(place);
  const support = useMemo(() => phoneAlertsSupport(readInstallEnv(window)), []);
  const where: GuideBrowser | null = support.kind === "needs-install" ? { browser: support.browser, ios: support.ios } : null;
  const guide = useGuideFlow(place === "block" && where && guideStartedAt() ? "return" : "none");
  const [outcome, setOutcome] = useState<{ kind: Outcome; at: Date } | null>(null);
  const [helping, setHelping] = useState(false);
  const [toSafari, setToSafari] = useState(false);
  const [busy, setBusy] = useState(false);
  // The card's result outlives the state that showed it (on, or blocked, ends the asking).
  const [kept, setKept] = useState(false);
  if (!show && !kept) return null;

  const device = deviceWord();
  const computer = device === "computer";
  const notNow = () => {
    quietForThreeDays();
    if (place === "block") {
      dismissCard();
      toast.info("You can turn them on any time in Account → Notifications.");
    }
    guide.dismiss();
    hide();
    setKept(false);
  };

  // Close on a paused question: gone for this opening, not a Not now.
  const closeCard = () => {
    hide();
    setKept(false);
  };

  const turnOn = async () => {
    if (!publicKey || busy) return;
    setBusy(true);
    setKept(true);
    const started = Date.now();
    // Straight from the tap: iPhone asks only from one.
    const next = await alerts.turnOn(publicKey);
    setBusy(false);
    const now = new Date();
    if (next === "on") {
      void showTestAlert(device);
      setOutcome({ kind: "on", at: now });
    } else if (next === "blocked") setOutcome({ kind: "blocked", at: now });
    else if (next === "off") setOutcome({ kind: Date.now() - started < 500 ? "paused" : "timeout", at: now });
    else setOutcome({ kind: "failed", at: now });
  };

  const primary = () => {
    if (where) return guide.open(0);
    if (support.kind === "other-browser") {
      markSetupAddress();
      return setToSafari(true);
    }
    void turnOn();
  };
  const primaryLabel = where || support.kind === "other-browser" ? "Show me how" : "Turn on alerts";

  let body: ReactNode;
  if (outcome?.kind === "on") {
    body = <AlertsOn sentAt={outcome.at} device={device} />;
  } else if (outcome?.kind === "blocked" || (!outcome && alerts.state === "blocked")) {
    body = (
      <div className="pa-blocked">
        <strong id={titleId}>Alerts are blocked on this {computer ? "computer" : "phone"}</strong>
        {helping ? (
          <BlockedHelp />
        ) : (
          <Button className="secondary-button" onClick={() => setHelping(true)}>
            How to turn them on
          </Button>
        )}
      </div>
    );
  } else if (toSafari && support.kind === "other-browser") {
    body = <OpenInSafari where={support.where} onClose={() => setToSafari(false)} />;
  } else if (where && guide.phase === "return") {
    return (
      <div className={`pa-slot is-${place}`}>
        <ReturnCard where={where} compact onAgain={() => guide.open(0)} onNotNow={notNow} />
        {guide.openAt !== null ? <HomeScreenGuide where={where} startAt={guide.openAt} onClose={guide.close} /> : null}
      </div>
    );
  } else if (where && guide.phase === "strip") {
    return (
      <div className={`pa-slot is-${place}`}>
        <GuideStrip
          where={where}
          onOpen={guide.open}
          actions={
            <>
              <Button className="secondary-button" onClick={() => guide.open(0)}>
                Show again
              </Button>
              <Button className="secondary-button" onClick={notNow}>
                Not now
              </Button>
            </>
          }
        />
        {guide.openAt !== null ? <HomeScreenGuide where={where} startAt={guide.openAt} onClose={guide.close} /> : null}
      </div>
    );
  }

  const paused = outcome?.kind === "paused";
  const guideLayer = where && guide.openAt !== null ? <HomeScreenGuide where={where} startAt={guide.openAt} onClose={guide.close} /> : null;

  if (place === "first") {
    return (
      <div className="pa-slot is-first">
        <aside className="pa-band" aria-labelledby={titleId}>
          <span className="pa-tile" aria-hidden>
            <Bell size={18} />
          </span>
          {body ?? (
            <div className="pa-band-text">
              <p id={titleId}>
                <b>{hasShifts ? "Your schedule is here." : "No shifts yet."}</b>{" "}
                {hasShifts ? "Get an alert when it changes." : "Get an alert when your schedule is posted."}
              </p>
              {outcome?.kind === "timeout" || paused ? <NotAsked paused={paused} /> : null}
              {outcome?.kind === "failed" ? <p role="alert" className="pa-small">Alerts couldn&rsquo;t be turned on. Try again.</p> : null}
              <Button disabled={busy} onClick={paused ? closeCard : primary}>
                {paused ? "Close" : primaryLabel}
              </Button>
            </div>
          )}
          <button type="button" className="pa-x" aria-label="Not now" onClick={notNow}>
            <X size={18} />
          </button>
        </aside>
        {guideLayer}
      </div>
    );
  }

  return (
    <div className="pa-slot is-block">
      <aside className="pa-block" aria-labelledby={titleId}>
        {body ?? (
          <>
            <div className="pa-lock" aria-hidden>
              <span className="pa-example">Example</span>
              <span className="pa-note">
                <span dangerouslySetInnerHTML={{ __html: nfIcon(32, 8) }} />
                <span>
                  <span className="pa-note-h">
                    <b>NEWFORK</b>
                    <span>Wed</span>
                  </span>
                  <b>Your Sat, Oct 24 shift changed</b>
                  <span>Now 5:00 PM–11:00 PM.</span>
                </span>
              </span>
            </div>
            <div className="pa-block-text">
              <h3 id={titleId}>Get shift alerts on this {computer ? "computer" : "phone"}</h3>
              <p>Know the moment your schedule is posted or a shift changes.</p>
              {outcome?.kind === "timeout" || paused ? <NotAsked paused={paused} /> : null}
              {outcome?.kind === "failed" ? <p role="alert" className="pa-small">Alerts couldn&rsquo;t be turned on. Try again.</p> : null}
              <div className="pa-actions2">
                <Button className="secondary-button" onClick={notNow}>
                  Not now
                </Button>
                <Button disabled={busy} onClick={paused ? closeCard : primary}>
                  {paused ? "Close" : primaryLabel}
                </Button>
              </div>
            </div>
          </>
        )}
      </aside>
      {guideLayer}
    </div>
  );
}
