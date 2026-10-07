import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

import { hasCronSecret } from "./cron-secret";

const request = (headers: Record<string, string | string[] | undefined>) => ({ headers });

describe("hasCronSecret (BL-282)", () => {
  it("takes the secret as a bearer token or in x-cron-secret", () => {
    expect(hasCronSecret(request({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
    expect(hasCronSecret(request({ "x-cron-secret": "s3cret" }), "s3cret")).toBe(true);
    expect(hasCronSecret(request({ "x-cron-secret": ["s3cret", "other"] }), "s3cret")).toBe(true);
  });

  it("refuses a wrong, shorter, longer or missing secret", () => {
    expect(hasCronSecret(request({ authorization: "Bearer s3creT" }), "s3cret")).toBe(false);
    expect(hasCronSecret(request({ "x-cron-secret": "s3c" }), "s3cret")).toBe(false);
    expect(hasCronSecret(request({ "x-cron-secret": "s3cret-and-more" }), "s3cret")).toBe(false);
    expect(hasCronSecret(request({}), "s3cret")).toBe(false);
    expect(hasCronSecret(request({ authorization: "Basic s3cret" }), "s3cret")).toBe(false);
  });

  it("compares in constant time, whatever the length", () => {
    vi.mocked(crypto.timingSafeEqual).mockClear();
    hasCronSecret(request({ "x-cron-secret": "s3c" }), "s3cret");
    expect(crypto.timingSafeEqual).toHaveBeenCalledTimes(1);
  });

  it("is the one place that reads the cron secret from a request", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const readers = (readdirSync(root, { recursive: true }) as string[])
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
      .filter((file) => readFileSync(join(root, file), "utf8").includes("x-cron-secret"))
      .map((file) => file.replaceAll("\\", "/"));
    expect(readers).toEqual(["cron-secret.ts"]);
  });
});
