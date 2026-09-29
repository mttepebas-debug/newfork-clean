/** Every email Newfork sends goes through here (BL-163). */
export interface ResendMessage {
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly idempotencyKey?: string;
  readonly attachment?: {
    readonly filename: string;
    readonly content: Buffer;
    readonly contentType: string;
  };
}

const RESEND_TIMEOUT_MS = 30_000;

export async function sendResendEmail(input: {
  readonly apiKey: string;
  /** The sentence thrown on a refusal, e.g. "Invitation delivery failed". */
  readonly failure: string;
  readonly message: ResendMessage;
  /** The caller's own deadline; without one the send stops after 30 s. */
  readonly signal?: AbortSignal;
}): Promise<void> {
  const { message } = input;
  const response = await fetch("https://api.resend.com/emails", {
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
  // Resend's body can echo the recipient or our key's scope: never pass it on.
  if (!response.ok) throw new Error(`${input.failure} (${response.status})`);
}
