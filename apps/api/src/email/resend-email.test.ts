import { afterEach, describe, expect, it, vi } from "vitest";
import { sendResendEmail } from "./resend-email";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubResend(status = 200) {
  const fetch = vi.fn(async () => new Response("{}", { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function sentRequest(fetch: ReturnType<typeof stubResend>) {
  const [target, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return {
    target,
    init,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(String(init.body)) as {
      from: string;
      to: string[];
      subject: string;
      html: string;
      attachments?: { filename: string; content: string; content_type: string }[];
    },
  };
}

describe("sendResendEmail (BL-163)", () => {
  it("posts one message to Resend with the key, sender and recipient", async () => {
    const fetch = stubResend();

    await sendResendEmail({
      apiKey: "re_test",
      failure: "Invitation delivery failed",
      message: {
        from: "Newfork <onboarding@newfork.test>",
        to: "ayse@example.test",
        subject: "Join your Newfork workspace",
        html: "<p>Hi</p>",
        idempotencyKey: "invite-1",
      },
    });

    const sent = sentRequest(fetch);
    expect(sent.target).toBe("https://api.resend.com/emails");
    expect(sent.init.method).toBe("POST");
    expect(sent.headers.Authorization).toBe("Bearer re_test");
    expect(sent.headers["Idempotency-Key"]).toBe("invite-1");
    expect(sent.body).toMatchObject({
      from: "Newfork <onboarding@newfork.test>",
      to: ["ayse@example.test"],
      subject: "Join your Newfork workspace",
      html: "<p>Hi</p>",
    });
    expect(sent.body.attachments).toBeUndefined();
  });

  it("gives up after a timeout unless the caller brings its own budget", async () => {
    const fetch = stubResend();
    const message = { from: "a@x.test", to: "b@x.test", subject: "s", html: "h" };

    await sendResendEmail({ apiKey: "re_test", failure: "Failed", message });
    expect(sentRequest(fetch).init.signal).toBeInstanceOf(AbortSignal);

    fetch.mockClear();
    const signal = new AbortController().signal;
    await sendResendEmail({ apiKey: "re_test", failure: "Failed", message, signal });
    expect(sentRequest(fetch).init.signal).toBe(signal);
  });

  it("encodes an attachment's bytes exactly once", async () => {
    const fetch = stubResend();
    const pdf = Buffer.from("%PDF-1.4 binary ÿ\u0000 end", "latin1");

    await sendResendEmail({
      apiKey: "re_test",
      failure: "Failed",
      message: {
        from: "a@x.test",
        to: "b@x.test",
        subject: "s",
        html: "h",
        attachment: {
          filename: "schedule-2026-08-17.pdf",
          content: pdf,
          contentType: "application/pdf",
        },
      },
    });

    const [attachment] = sentRequest(fetch).body.attachments ?? [];
    expect(attachment).toMatchObject({
      filename: "schedule-2026-08-17.pdf",
      content_type: "application/pdf",
    });
    expect(Buffer.from(attachment!.content, "base64").equals(pdf)).toBe(true);
  });

  it("says which email failed and the status, and nothing Resend said", async () => {
    stubResend(422);

    await expect(
      sendResendEmail({
        apiKey: "re_test",
        failure: "Password reset delivery failed",
        message: { from: "a@x.test", to: "b@x.test", subject: "s", html: "h" },
      }),
    ).rejects.toThrow(/^Password reset delivery failed \(422\)$/);
  });
});
