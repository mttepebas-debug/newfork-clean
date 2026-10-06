import { createHash } from "node:crypto";

// Test-only helpers for the SQL authorization matrix; not exported from the
// package. The dump script (scripts/dump-authorization-matrix.ts) and the test
// (authorization.test.ts) both read the matrix through here, so they agree on
// which part of the file is "the rules".

/** The rule sections of the matrix: who they are, what they act on, the actions, expected(). */
export function matrixRuleSections(sql: string): string {
  const text = sql.replace(/\r\n/g, "\n");
  const start = text.indexOf("-- 2. Who they are");
  const end = text.indexOf("-- 6. Where the app is known");
  if (start < 0 || end < start) {
    throw new Error("authorization_matrix.test.sql: section markers 2 and 6 not found");
  }
  return text.slice(start, end);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
