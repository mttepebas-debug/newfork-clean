import type { ScheduleTemplateApplyResult } from "@newfork/shared";

const longNameLimit = 28;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Counted in characters as a person sees them, so an emoji is never cut in half (BL-236).
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function shortName(name: string): string {
  const characters = Array.from(graphemes.segment(name), (part) => part.segment);
  return characters.length > longNameLimit
    ? `${characters.slice(0, longNameLimit - 1).join("").trimEnd()}…`
    : name;
}

function listNames(names: readonly string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

/**
 * The "Template applied" toast text. A shift whose person could not take it
 * came in as an open shift, and the count says so (BL-699). When the template
 * carried labels that are archived now, the shifts still came in without them,
 * and the person is told which labels and how many shifts (BL-197).
 */
export function templateAppliedDescription(
  templateName: string,
  result: Pick<ScheduleTemplateApplyResult, "applied_shift_count" | "skipped"> &
    Partial<Pick<ScheduleTemplateApplyResult, "converted_open_count">>,
): string {
  const open = result.converted_open_count ?? 0;
  const became = open === 0
    ? ""
    : `, ${open} became ${open === 1 ? "an open shift" : "open shifts"}`;
  const added = `${templateName}: ${plural(result.applied_shift_count, "shift", "shifts")} added${became}.`;
  const labels = result.skipped.filter((item) => item.kind === "archived_label");
  if (labels.length === 0) return added;
  const names = listNames(labels.map((item) => shortName(item.name)));
  const shifts = labels.reduce((sum, item) => sum + item.shift_count, 0);
  const one = labels.length === 1;
  return `${added} ${names} ${one ? "is" : "are"} archived, so ${plural(shifts, "shift was", "shifts were")} added without ${one ? "it" : "them"}.`;
}
