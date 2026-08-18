import { describe, expect, it } from "vitest";
import { createLocalSsnEncryptionService } from "./ssn-encryption";

describe("SSN encryption boundary", () => {
  it("returns only an authenticated envelope and last four", async () => {
    const service = createLocalSsnEncryptionService("test-only-key");
    const envelope = await service.encrypt("123456789", {
      workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
      employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
      environment: "test",
    });
    expect(envelope.lastFour).toBe("6789");
    expect(envelope.ciphertext).not.toContain("123456789");
    expect(JSON.stringify(envelope)).not.toContain("123456789");
    expect(Buffer.from(envelope.nonce, "base64")).toHaveLength(12);
    expect(Buffer.from(envelope.authenticationTag, "base64")).toHaveLength(16);
  });

  it("rejects malformed identifiers before encryption", async () => {
    const service = createLocalSsnEncryptionService("test-only-key");
    await expect(
      service.encrypt("123-45-6789", {
        workspaceId: "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd",
        employeeId: "fe201916-aa0e-480b-9144-1e1c8da20a31",
        environment: "test",
      }),
    ).rejects.toThrow("nine-digit SSN");
  });
});
