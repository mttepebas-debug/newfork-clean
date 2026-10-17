import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { pushServer } from "./channels-data";
import { readPhoneAlertsState, turnOffPhoneAlerts, turnOnPhoneAlerts, type PhoneAlertsState } from "./push-client";

/**
 * This device's phone alerts for a screen: where it stands (null while reading), turning on from a tap and
 * off. A change refreshes the person's choices, whose device count it moves.
 */
export function usePhoneAlerts() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PhoneAlertsState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void readPhoneAlertsState()
      .catch((): PhoneAlertsState => "unsupported")
      .then((next) => {
        if (live) setState(next);
      });
    return () => {
      live = false;
    };
  }, []);

  const settle = useCallback(
    async (work: () => Promise<PhoneAlertsState>) => {
      setBusy(true);
      setFailed(false);
      try {
        const next = await work();
        setState(next);
        await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
        return next;
      } catch {
        setFailed(true);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [queryClient],
  );

  // Called straight from the tap: iPhone asks for permission only from one.
  const turnOn = useCallback((publicKey: string) => settle(() => turnOnPhoneAlerts(publicKey, pushServer)), [settle]);
  const turnOff = useCallback(
    () =>
      settle(async () => {
        await turnOffPhoneAlerts(pushServer);
        return "off";
      }),
    [settle],
  );

  return { state, busy, failed, turnOn, turnOff };
}
