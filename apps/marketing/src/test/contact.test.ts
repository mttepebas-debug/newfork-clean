import { mailtoFor, submitContact, validateContact, type ContactFields } from "../content/contact";

const fields: ContactFields = {
  topic: "sales",
  name: "Dana Ortiz",
  email: "dana@harborgroup.com",
  restaurant: "Harbor Group",
  locations: "2–5 locations",
  message: "We run three locations and want to see the schedule.",
};

describe("contact form", () => {
  it("validates the required fields", () => {
    expect(validateContact(fields)).toEqual({});
    const errors = validateContact({ ...fields, name: " ", email: "dana@", message: "hi" });
    expect(Object.keys(errors).sort()).toEqual(["email", "message", "name"]);
  });

  it("falls back to a prefilled email when no endpoint is configured", async () => {
    const result = await submitContact(fields, "");
    expect(result.kind).toBe("mailto");
    const href = (result as { href: string }).href;
    expect(href.startsWith("mailto:sales@newfork.example?subject=")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Restaurant: Harbor Group");
    expect(mailtoFor(fields)).toBe(href);
  });

  it("posts JSON to the configured endpoint", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await submitContact(fields, "https://forms.example/contact", fetcher as unknown as typeof fetch);
    expect(result).toEqual({ kind: "sent" });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ topic: "sales", page: "contact" });
  });

  it("reports a failed post with the address to use instead", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 500 }));
    const result = await submitContact(fields, "https://forms.example/contact", fetcher as unknown as typeof fetch);
    expect(result).toEqual({ kind: "error", message: expect.stringContaining("sales@newfork.example") });
  });
});
