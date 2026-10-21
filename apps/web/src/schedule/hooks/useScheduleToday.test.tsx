import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inDeviceZone } from "../../employee-hub/device-zone.testing";
import { useScheduleToday } from "./useScheduleQuery";

// S-226: Schedule and Lineup read today at the location (the first in its order), the device only before any read.
const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const location = (timezone: string, sort_order: number) => ({ id: crypto.randomUUID(), name: timezone, timezone, sort_order });

function today(client: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useScheduleToday(workspace), { wrapper }).result.current;
}

describe("useScheduleToday", () => {
  afterEach(() => vi.useRealTimers());

  it("reads the first location's day once a read has named it, the device's before", async () => {
    await inDeviceZone("America/Los_Angeles", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // 11:30 PM Tuesday in California, 9:30 AM Wednesday in Istanbul.
      vi.setSystemTime(new Date("2026-10-21T06:30:00Z"));
      const client = new QueryClient();
      expect(today(client)).toBe("2026-10-20");
      client.setQueryData(["schedule-read", workspace, "2026-10-20"], {
        locations: [location("America/Los_Angeles", 2), location("Europe/Istanbul", 1)],
      });
      expect(today(client)).toBe("2026-10-21");
      // Another workspace's read says nothing about this one's.
      const other = new QueryClient();
      other.setQueryData(["schedule-read", "another", "2026-10-20"], { locations: [location("Europe/Istanbul", 1)] });
      expect(today(other)).toBe("2026-10-20");
    });
  });
});
