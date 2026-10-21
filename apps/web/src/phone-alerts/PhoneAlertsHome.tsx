import { useToast } from "@newfork/ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { loadNotificationPreferences, notificationPreferencesKey } from "../notification-settings/notification-settings-data";
import { useNotificationChannels } from "./channels-data";
import { cardDismissed, dismissCard, scheduleSeen } from "./home-card-memory";
import { phoneAlertsSupport, readInstallEnv, type PhoneAlertsSupport } from "./install-state";
import { PhoneAlertsCard } from "./PhoneAlertsCard";
import { usePhoneAlerts } from "./use-phone-alerts";

/**
 * The "Get alerts on this phone" card on Home (plan variant A, KARARLAR S-123): once the person has opened
 * their schedule on this device, while phone alerts are set up, the workspace has them on, this browser
 * can take them and nobody asked here yet. It asks once: Not now hides it on this device for good, and
 * Account → Notifications stays the way back.
 */
export function PhoneAlertsHome({ audience }: { readonly audience: "employee" | "manager" }) {
  const { context } = useAuth();
  const toast = useToast();
  const config = useNotificationChannels();
  const alerts = usePhoneAlerts();
  const [hidden, setHidden] = useState(() => cardDismissed() || !scheduleSeen());
  const env = useMemo(() => readInstallEnv(window), []);
  const workspaceId = context?.workspace.id ?? "";
  const asking = !hidden && config.push.available && (alerts.state === "off" || alerts.state === "needs-install");
  const preferences = useQuery({
    queryKey: notificationPreferencesKey(workspaceId),
    queryFn: () => loadNotificationPreferences(workspaceId),
    enabled: asking && Boolean(workspaceId),
  });

  if (!asking || !preferences.data?.channels.push.workspace_enabled) return null;
  const publicKey = config.push.public_key;
  // The hook already read this device: off means the browser can ask now.
  const detected = phoneAlertsSupport(env);
  const support: PhoneAlertsSupport =
    alerts.state === "needs-install" && detected.kind === "needs-install"
      ? detected
      : {
          kind: "ready",
          device: detected.kind === "ready" ? detected.device : /Android|iPhone|iPad|Mobile/.test(env.userAgent) ? "phone" : "computer",
          installed: env.standalone,
        };

  return (
    <div className="phone-alerts-float">
      <PhoneAlertsCard
        support={support}
        audience={audience}
        onTurnOn={() => {
          if (!publicKey) return;
          void alerts.turnOn(publicKey).then((next) => {
            if (next === "on") toast.success("Phone alerts are on.");
            else if (next === "blocked") toast.warning("Blocked. You can allow it later in the browser settings.");
            else if (next === null) toast.error("Phone alerts couldn't be turned on. Try again in Account → Notifications.");
            if (next !== "off") setHidden(true);
          });
        }}
        onNotNow={() => {
          dismissCard();
          setHidden(true);
          toast.info("You can turn them on any time in Account → Notifications.");
        }}
      />
    </div>
  );
}
