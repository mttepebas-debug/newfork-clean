import {
  GenerateDataKeyCommand,
  KMSClient,
  type KMSClientConfig,
} from "@aws-sdk/client-kms";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

export interface SsnEncryptionContext {
  readonly workspaceId: string;
  readonly employeeId: string;
  readonly environment: string;
}

export interface SsnEnvelope {
  readonly ciphertext: string;
  readonly encryptedDataKey: string;
  readonly nonce: string;
  readonly authenticationTag: string;
  readonly keyId: string;
  readonly keyVersion: string;
  readonly lastFour: string;
}

export interface SsnEncryptionService {
  encrypt(ssn: string, context: SsnEncryptionContext): Promise<SsnEnvelope>;
}

export function createAwsSsnEncryptionService(options: {
  readonly keyId: string;
  readonly region: string;
  readonly clientConfig?: KMSClientConfig;
}): SsnEncryptionService {
  const client = new KMSClient({
    region: options.region,
    ...options.clientConfig,
  });
  return {
    async encrypt(ssn, context) {
      assertSsn(ssn);
      const encryptionContext = contextPairs(context);
      const response = await client.send(
        new GenerateDataKeyCommand({
          KeyId: options.keyId,
          KeySpec: "AES_256",
          EncryptionContext: encryptionContext,
        }),
      );
      if (!response.Plaintext || !response.CiphertextBlob)
        throw new Error("KMS did not return an encryption data key");
      const dataKey = Buffer.from(response.Plaintext);
      try {
        return encryptWithKey(
          ssn,
          dataKey,
          Buffer.from(response.CiphertextBlob).toString("base64"),
          options.keyId,
          response.KeyId ?? options.keyId,
          encryptionContext,
        );
      } finally {
        dataKey.fill(0);
        response.Plaintext.fill(0);
      }
    },
  };
}

export function createLocalSsnEncryptionService(
  secret = "newfork-local-synthetic-ssn-only",
): SsnEncryptionService {
  const key = createHash("sha256").update(secret).digest();
  return {
    async encrypt(ssn, context) {
      assertSsn(ssn);
      const dataKey = Buffer.from(key);
      try {
        return encryptWithKey(
          ssn,
          dataKey,
          "local-development-key",
          "local-development-only",
          "local-v1",
          contextPairs(context),
        );
      } finally {
        dataKey.fill(0);
      }
    },
  };
}

function encryptWithKey(
  ssn: string,
  dataKey: Buffer,
  encryptedDataKey: string,
  keyId: string,
  keyVersion: string,
  context: Record<string, string>,
): SsnEnvelope {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, nonce);
  cipher.setAAD(Buffer.from(stableContext(context), "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(ssn, "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    encryptedDataKey,
    nonce: nonce.toString("base64"),
    authenticationTag: cipher.getAuthTag().toString("base64"),
    keyId,
    keyVersion,
    lastFour: ssn.slice(-4),
  };
}

function contextPairs(context: SsnEncryptionContext): Record<string, string> {
  return {
    application: "newfork",
    purpose: "employee-ssn",
    environment: context.environment,
    workspace_id: context.workspaceId,
    employee_id: context.employeeId,
  };
}

function stableContext(context: Record<string, string>): string {
  return Object.entries(context)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function assertSsn(value: string): void {
  if (!/^\d{9}$/.test(value))
    throw new Error("A valid nine-digit SSN is required");
}
