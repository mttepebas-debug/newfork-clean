/**
 * Whether this open of the app has already put the waiting invitations in
 * front of the account (BL-624). KARARLAR "Girişten sonra yönlendirme": a
 * waiting invitation is the first screen of every sign-in, and "every sign-in"
 * means every open of the app, a new tab included (Mert, 2026-10-19). Kept per
 * tab, so a reload does not ask again and a new tab does. It names whose answer
 * it is: on a shared device a tab the browser reopens may still hold it when
 * somebody else is signed in, and their invitations are their own. Every
 * sign-in, sign-up and sign-out forgets it (`AuthContext`).
 */
export const invitationPromptStorageKey = "newfork.invitationPromptAnswered";

export function invitationPromptAnswered(userId: string | null | undefined): boolean {
  if (typeof window === "undefined" || !userId) return false;
  return window.sessionStorage.getItem(invitationPromptStorageKey) === userId;
}

export function markInvitationPromptAnswered(userId: string | null | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  window.sessionStorage.setItem(invitationPromptStorageKey, userId);
}

export function forgetInvitationPrompt(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(invitationPromptStorageKey);
}
