import { useEffect, useRef, useState } from "react";
import { apiRequest, supabaseClient } from "../lib/supabase";
import { TimezoneSelect } from "./TimezoneSelect";

export function LocationTimezoneField({ country, postal, value, onChange, id }: { country: string; postal: string; value: string; onChange: (value: string) => void; id?: string }) {
  const latest = useRef({ value, onChange }); latest.current = { value, onChange };
  const manual = useRef(Boolean(value));
  const generation = useRef(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const request = ++generation.current;
    if (manual.current) return;
    // A previous automatic value belongs to its previous postal input.
    if (latest.current.value) latest.current.onChange("");
    setStatus("");
    if (!country || postal.trim().length < 2) return;
    const timer = window.setTimeout(async () => {
      if (!supabaseClient) return;
      setStatus("Looking up a time zone suggestion…");
      try {
        const result = await apiRequest(supabaseClient, `/v1/location-timezone-suggestion?country=${encodeURIComponent(country)}&postal=${encodeURIComponent(postal.trim())}`) as { timezone: string | null; status: string };
        if (request !== generation.current || manual.current) return;
        if (result.timezone) { latest.current.onChange(result.timezone); setStatus("Suggested from the postal code. Check that it matches this location."); }
        else setStatus("No clear suggestion. Select the time zone for this location.");
      } catch { if (request === generation.current && !manual.current) setStatus("Suggestion unavailable. You can select a time zone."); }
    }, 400);
    return () => { window.clearTimeout(timer); ++generation.current; };
  }, [country, postal]);
  return <><TimezoneSelect id={id} value={value} onChange={(zone) => { manual.current = true; ++generation.current; setStatus(""); onChange(zone); }} />{status && <small role="status">{status}</small>}<small><a href="https://www.zippopotam.us/" target="_blank" rel="noreferrer">Postal data: Zippopotam.us / GeoNames</a>{" · "}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Timezone boundaries: © OpenStreetMap contributors</a></small></>;
}
