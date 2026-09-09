import type {
  ScheduleLineupEntry,
  ScheduleLineupEntryInput,
  ScheduleLineupSection,
} from "@newfork/shared";
export function entryInput(row: ScheduleLineupEntry): ScheduleLineupEntryInput {
  return {
    placement_segments: row.placement_segments ?? [],
    source_shift_id: row.source_shift_id,
    employee_id: row.employee_id,
    job_id: row.job_id,
    shift_type_id: row.shift_type_id,
    start_time: row.start_time,
    end_time: row.end_time,
    section_id: row.section_id,
    station: row.station,
    note: row.note,
    call_off: row.call_off,
    hidden: row.hidden,
    display_order: row.display_order,
  };
}

export function projectLineupEntries(
  rows: ScheduleLineupEntry[],
  timezone: string,
): ScheduleLineupEntry[] {
  const time = (instant: string) =>
    new Date(instant).toLocaleTimeString("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  return rows.flatMap((row) =>
    row.placement_segments?.length
      ? row.placement_segments.map((segment) => ({
          ...row,
          id: segment.id,
          placement_parent_id: row.id,
          placement_start_at: segment.start_at,
          placement_end_at: segment.end_at,
          start_time: time(segment.start_at),
          end_time: time(segment.end_at),
          section_id: segment.section_id,
          section_name: segment.section_name ?? "",
          station: segment.station,
          placement_segments: [],
        }))
      : [row],
  );
}

export function lineupSectionAllowed(
  section: ScheduleLineupSection,
  locationId: string,
  serviceId?: string | null,
  jobId?: string | null,
) {
  return (
    (!section.location_ids?.length ||
      section.location_ids.includes(locationId)) &&
    (!serviceId ||
      !section.shift_type_ids?.length ||
      section.shift_type_ids.includes(serviceId)) &&
    (!jobId || !section.job_ids?.length || section.job_ids.includes(jobId))
  );
}
