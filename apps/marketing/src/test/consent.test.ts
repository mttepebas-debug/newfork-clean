import {
  allowed,
  anyOptionalInUse,
  parseConsent,
  readConsent,
  STORAGE_KEY,
  whenAllowed,
  writeConsent,
} from "../privacy/consent";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("privacy choices", () => {
  it("records a decision even though nothing optional is in use", () => {
    const store = memoryStore();
    expect(readConsent(store)).toBeNull();
    const record = writeConsent({ analytics: true, marketing: true }, store, new Date("2026-10-06T12:00:00Z"));
    expect(record).toEqual({ version: 1, decidedAt: "2026-10-06T12:00:00.000Z", analytics: false, marketing: false });
    expect(readConsent(store)).toEqual(record);
    expect(store.getItem(STORAGE_KEY)).toContain('"version":1');
  });

  it("matches what the site actually loads: no analytics or marketing technology", () => {
    expect(anyOptionalInUse()).toBe(false);
    expect(allowed("analytics", { version: 1, decidedAt: "x", analytics: true, marketing: true })).toBe(false);
    const load = vi.fn();
    whenAllowed("analytics", load)();
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores malformed stored values", () => {
    expect(parseConsent("{")).toBeNull();
    expect(parseConsent('{"version":2,"decidedAt":"x"}')).toBeNull();
  });
});
