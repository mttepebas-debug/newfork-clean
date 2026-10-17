/**
 * One layout for every notice email (BILDIRIM-14, KARARLAR S-130): the workspace's name (or the
 * account's), the notice, a button into the app and why it came, with a plain-text part beside the HTML.
 * No tracking pixel and no tracked link. Every value is escaped; names arrive in titles.
 */
export interface NotificationEmailItem {
  readonly delivery_id: string;
  readonly to: string;
  readonly subject: string;
  readonly title: string;
  readonly body: string | null;
  /** A path inside the app, as the notice keeps it. */
  readonly url: string | null;
  /** null: a notice about the person's own account. */
  readonly workspace_name: string | null;
  readonly level: "required" | "important" | "optional";
  readonly topic: string;
  readonly idempotency_key: string;
}

export interface NotificationEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => escapes[character] ?? character);

export function renderNotificationEmail(item: NotificationEmailItem, appUrl: string): NotificationEmail {
  const link = `${appUrl.replace(/\/$/, "")}${item.url ?? "/app"}`;
  const from = item.workspace_name ?? "Your Newfork account";
  const why =
    item.level === "required"
      ? "This message is always sent."
      : `You get this because ${item.topic} email is on. Change it in Account → Notifications.`;

  const html = [
    "<!doctype html>",
    '<html lang="en"><body style="margin:0;padding:24px;background:#f6f7f6;font-family:Inter,Arial,sans-serif;color:#1f2a24">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px">',
    '<tr><td style="padding:24px 24px 0;font-size:13px;color:#5b6660">',
    escape(from),
    "</td></tr>",
    '<tr><td style="padding:8px 24px 0;font-size:18px;font-weight:600;line-height:1.4">',
    escape(item.title),
    "</td></tr>",
    item.body
      ? `<tr><td style="padding:8px 24px 0;font-size:15px;line-height:1.5">${escape(item.body)}</td></tr>`
      : "",
    '<tr><td style="padding:20px 24px">',
    `<a href="${escape(link)}" style="display:inline-block;padding:10px 18px;background:#1f7a4d;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600">Open in Newfork</a>`,
    "</td></tr>",
    '<tr><td style="padding:0 24px 24px;font-size:12px;color:#5b6660;line-height:1.5">',
    escape(why),
    "</td></tr>",
    "</table></body></html>",
  ].join("");

  const text = [from, "", item.title, ...(item.body ? ["", item.body] : []), "", `Open in Newfork: ${link}`, "", why].join("\n");

  return { subject: item.subject, html, text };
}
