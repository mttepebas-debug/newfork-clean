// The way from another iPhone browser to Safari (TELEFON-TUR2, §5.0 item 19): Account → Notifications with
// ?setup=alerts opens the Home Screen steps once the person is signed in there, and asks nothing (K5).

/** Account → Notifications (notificationSettingsPath in notifications/NotificationViews) with the steps open. */
export const SETUP_PATH = "/account/preferences/notifications?setup=alerts";

export function setupLink(win: Window = window): string {
  return `${win.location.origin}${SETUP_PATH}`;
}

/**
 * Turns this tab's address into the setup link without a reload, so a browser's own Open in Safari (which
 * takes the address as it is) lands on the steps too.
 */
export function markSetupAddress(win: Window = window): void {
  try {
    if (`${win.location.pathname}${win.location.search}` !== SETUP_PATH) win.history.replaceState(win.history.state, "", SETUP_PATH);
  } catch {
    // The address stays; Copy link still carries the steps.
  }
}

/** Copies the setup link; false when the browser would not let the page write to the clipboard. */
export async function copySetupLink(win: Window = window): Promise<boolean> {
  try {
    await win.navigator.clipboard.writeText(setupLink(win));
    return true;
  } catch {
    return false;
  }
}
