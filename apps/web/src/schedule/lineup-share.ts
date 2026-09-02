import type {
  ScheduleLineupEntry,
  ScheduleLineupLocation,
  ScheduleLineupReadModel,
} from "@newfork/shared/schedule";

export function formatLineupShareDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    weekday: "long",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  const weekday = parts.find((part) => part.type === "weekday")?.value;
  return month && day && year && weekday
    ? `${month}/${day}/${year} ${weekday}`
    : iso;
}

function formatLineupTime(value: string | null): string {
  if (!value) return "";
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return value;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return value;
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
}

function noteLine(label: string, value: string): string | null {
  const text = value.trim();
  return text ? `${label}: ${text}` : null;
}

function stationLabel(entry: ScheduleLineupEntry): string {
  return [entry.section_name, entry.station]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" - ");
}

function entryLine(entry: ScheduleLineupEntry): string {
  const time = formatLineupTime(entry.start_time);
  const station = stationLabel(entry);
  return `${time ? `${time} ` : ""}${entry.employee_name}${
    station ? ` - ${station}` : ""
  }`;
}

function activeEntries(
  location: ScheduleLineupLocation,
  shiftTypeId: string,
): ScheduleLineupEntry[] {
  return location.entries
    .filter(
      (entry) =>
        entry.shift_type_id === shiftTypeId &&
        entry.employee_id &&
        !entry.call_off &&
        !entry.hidden,
    )
    .sort(
      (left, right) =>
        left.display_order - right.display_order ||
        (left.start_time ?? "").localeCompare(right.start_time ?? "") ||
        left.employee_name.localeCompare(right.employee_name),
    );
}

export function buildLineupShareText(model: ScheduleLineupReadModel): string {
  const lines: string[] = [];

  for (const location of model.locations) {
    if (lines.length > 0) lines.push("");
    lines.push(`${location.name} - ${formatLineupShareDate(model.date)}`);

    for (const shiftType of model.shift_types) {
      const entries = activeEntries(location, shiftType.id);
      const brief = location.briefs.find(
        (item) => item.shift_type_id === shiftType.id,
      );
      const briefLines = brief
        ? [
            noteLine("86", brief.out_of_stock),
            noteLine("Specials", brief.specials),
            noteLine("Pre-shift", brief.pre_shift_notes),
          ].filter((value): value is string => Boolean(value))
        : [];
      if (entries.length === 0 && briefLines.length === 0) continue;

      lines.push("");
      lines.push(shiftType.name);
      lines.push(...briefLines);

      const byJob = new Map<string, ScheduleLineupEntry[]>();
      for (const entry of entries) {
        const key = entry.job_name || "Position needed";
        byJob.set(key, [...(byJob.get(key) ?? []), entry]);
      }
      for (const [jobName, jobEntries] of byJob) {
        lines.push(jobName);
        lines.push(...jobEntries.map(entryLine));
      }
    }
  }

  return lines.join("\n");
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Exported Line-up did not produce a data URL"));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read exported Line-up"));
    reader.readAsDataURL(blob);
  });
}

export async function renderLineupPngBlob(element: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(element, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
  });
  if (!blob) throw new Error("Could not render Line-up image");
  return blob;
}

export async function copyLineupPng(element: HTMLElement): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not supported in this browser.");
  }
  const blob = await renderLineupPngBlob(element);
  const type = blob.type || "image/png";
  await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
}

export async function downloadLineupPng(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  saveBlob(await renderLineupPngBlob(element), filename);
}

export async function downloadLineupPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const blob = await renderLineupPngBlob(element);
  const dataUrl = await blobToDataUrl(blob);
  const { jsPDF } = await import("jspdf");
  const width = Math.max(640, element.offsetWidth);
  const height = Math.max(480, element.offsetHeight);
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, width, height);
  pdf.save(filename);
}

export async function shareLineupPng(
  element: HTMLElement,
  filename: string,
  text = "",
): Promise<boolean> {
  const blob = await renderLineupPngBlob(element);
  const file = new File([blob], filename, { type: "image/png" });
  const shareData: ShareData = { files: [file], title: "Line-up" };
  if (text) shareData.text = text;
  if (navigator.canShare?.(shareData) && navigator.share) {
    await navigator.share(shareData);
    return true;
  }
  saveBlob(blob, filename);
  return false;
}
