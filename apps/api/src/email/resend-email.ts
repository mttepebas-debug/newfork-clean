/** Every email Newfork sends goes through here (BL-163). */
export interface ResendMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  /** A plain-text part beside the HTML (BILDIRIM-14). */
  readonly text?: string;
  readonly idempotencyKey?: string;
  readonly attachment?: {
    readonly filename: string;
    readonly content: Buffer;
    readonly contentType: string;
  };
}

const RESEND_TIMEOUT_MS = 30_000;

/**
 * A send that did not go: Resend's status, or none when it timed out or the network failed. `code` is
 * what a delivery records ('http_429', 'timeout', 'network'); the message names only the email and the
 * status, never Resend's words, which can echo the recipient.
 */
export class ResendSendError extends Error {
  readonly code: string;
  constructor(
    failure: string,
    readonly status: number | null,
    code?: "timeout" | "network",
  ) {
    const said = status === null ? (code ?? "network") : String(status);
    super(`${failure} (${said})`);
    this.name = "ResendSendError";
    this.code = status === null ? (code ?? "network") : `http_${status}`;
  }
}

export async function sendResendEmail(input: {
  readonly apiKey: string;
  /** The sentence thrown on a refusal, e.g. "Invitation delivery failed". */
  readonly failure: string;
  readonly message: ResendMessage;
  /** The caller's own deadline; without one the send stops after 30 s. */
  readonly signal?: AbortSignal;
}): Promise<{ readonly id: string | null }> {
  const { message } = input;
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      signal: input.signal ?? AbortSignal.timeout(RESEND_TIMEOUT_MS),
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...(message.idempotencyKey
          ? { "Idempotency-Key": message.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text === undefined ? {} : { text: message.text }),
        ...(message.attachment
          ? {
              attachments: [
                {
                  filename: message.attachment.filename,
                  content: message.attachment.content.toString("base64"),
                  content_type: message.attachment.contentType,
                },
              ],
            }
          : {}),
      }),
    });
  } catch (error) {
    const late = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    throw new ResendSendError(input.failure, null, late ? "timeout" : "network");
  }
  // Resend's body can echo the recipient or our key's scope: never pass it on.
  if (!response.ok) throw new ResendSendError(input.failure, response.status);
  // Only the id is read from the answer.
  let answer: unknown = null;
  try {
    answer = await response.json();
  } catch {
    answer = null;
  }
  const id = answer && typeof answer === "object" && "id" in answer && typeof answer.id === "string" ? answer.id : null;
  return { id };
}
