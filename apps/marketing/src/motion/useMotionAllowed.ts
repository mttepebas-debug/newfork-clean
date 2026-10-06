import { useSyncExternalStore } from "react";
import { motionAllowed, subscribeMotion } from "./env";

/** False on the server and during hydration, then the real answer. */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribeMotion, motionAllowed, () => false);
}
