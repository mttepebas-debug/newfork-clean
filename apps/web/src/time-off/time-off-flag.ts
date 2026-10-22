// Time off rebuild (KARARLAR S-239, S-242): the new Time off draws only in a development build where this
// browser asked for it (localStorage "newfork:time-off-v2" = "1"). A production build is always false, so
// the live app keeps the old Time off until D7 removes it and this flag.
export const TIME_OFF_V2_KEY = "newfork:time-off-v2";

export function timeOffV2Enabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    return window.localStorage.getItem(TIME_OFF_V2_KEY) === "1";
  } catch {
    return false;
  }
}
