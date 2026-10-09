import { expect } from "vitest";

// Runs fn as if the device were in zone; Node re-reads TZ when it is assigned.
export async function inDeviceZone<T>(zone: string, fn: () => T | Promise<T>): Promise<T> {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
    return await fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

// Intl puts a narrow no-break space before AM/PM.
export const plain = (text: string | null | undefined) => (text ?? "").replace(/\s/g, " ");
