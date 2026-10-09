import { availableIanaTimezones } from "@newfork/shared";
import { useMemo } from "react";

export function TimezoneSelect({ value, onChange, id, disabled = false }: { value: string; onChange: (value: string) => void; id?: string; disabled?: boolean }) {
  const zones = useMemo(() => availableIanaTimezones(value), [value]);
  return <select id={id} aria-label="Time zone" required value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="" disabled>Select a time zone</option>
    {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
  </select>;
}
