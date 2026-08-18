import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 32;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function hashOpaqueSecret(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function createEnrollmentCode(): string {
  const bytes = randomBytes(13);
  let bits = 0;
  let value = 0;
  let encoded = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && encoded.length < 20) {
      bits -= 5;
      encoded += BASE32_ALPHABET[(value >>> bits) & 31];
      value &= (1 << bits) - 1;
    }
  }
  return encoded.match(/.{5}/g)?.join("-") ?? encoded;
}

export function normalizeEnrollmentCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export async function hashKioskPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveScrypt(pin, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: 64 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

export async function verifyKioskPin(
  pin: string,
  encodedHash: string,
): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, salt, expected] =
    encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    Number(cost) !== SCRYPT_COST ||
    Number(blockSize) !== SCRYPT_BLOCK_SIZE ||
    Number(parallelization) !== SCRYPT_PARALLELIZATION ||
    !salt ||
    !expected
  )
    return false;
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (
    Buffer.from(salt, "base64url").length !== 16 ||
    expectedBuffer.length !== SCRYPT_KEY_LENGTH
  )
    return false;
  const derived = await deriveScrypt(
    pin,
    Buffer.from(salt, "base64url"),
    expectedBuffer.length,
    {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization),
      maxmem: 64 * 1024 * 1024,
    },
  );
  return (
    derived.length === expectedBuffer.length &&
    timingSafeEqual(derived, expectedBuffer)
  );
}

function deriveScrypt(
  value: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(value, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
