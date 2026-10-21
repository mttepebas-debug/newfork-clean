import { useEffect, useState } from "react";
import { daySlot, type DaySlot } from "../employee-hub/home-model";

const slotNow = () => {
  const now = new Date();
  return daySlot(now.getHours() * 60 + now.getMinutes());
};

/** The part of the day on this device's clock, read again every minute: the page area's sky follows it. */
export function useDaySlot(): DaySlot {
  const [slot, setSlot] = useState(slotNow);
  useEffect(() => {
    const timer = window.setInterval(() => setSlot(slotNow()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return slot;
}
