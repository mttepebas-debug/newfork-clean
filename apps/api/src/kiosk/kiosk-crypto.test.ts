import { describe, expect, it } from "vitest";
import {
  createEnrollmentCode,
  createOpaqueToken,
  hashKioskPin,
  hashOpaqueSecret,
  normalizeEnrollmentCode,
  verifyKioskPin,
} from "./kiosk-crypto";

describe("kiosk cryptography", () => {
  it("creates high-entropy enrollment codes with a stable human format", () => {
    const first = createEnrollmentCode();
    const second = createEnrollmentCode();
    expect(first).toMatch(/^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){3}$/);
    expect(second).not.toBe(first);
    expect(normalizeEnrollmentCode(first.toLowerCase())).toHaveLength(20);
  });

  it("stores opaque tokens only through deterministic SHA-256 verifiers", () => {
    const token = createOpaqueToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashOpaqueSecret(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOpaqueSecret(token)).not.toBe(token);
  });

  it("uses uniquely salted scrypt hashes and constant-result PIN verification", async () => {
    const first = await hashKioskPin("123456");
    const second = await hashKioskPin("123456");
    expect(first).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(second).not.toBe(first);
    await expect(verifyKioskPin("123456", first)).resolves.toBe(true);
    await expect(verifyKioskPin("654321", first)).resolves.toBe(false);
    await expect(verifyKioskPin("123456", "invalid")).resolves.toBe(false);
    await expect(
      verifyKioskPin(
        "123456",
        "scrypt$1073741824$8$1$abcdefghijklmnop$abcdefghijklmnopqrstuvwxyz1234567890",
      ),
    ).resolves.toBe(false);
  });
});
