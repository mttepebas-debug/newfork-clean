import { isValidIanaTimezone } from "@newfork/shared";
import {
  prepareScheduleExport,
  renderScheduleCsv,
  renderSchedulePdf,
  renderSchedulePrintHtml,
  renderScheduleWorkbook,
} from "./schedule-export";
import type {
  ScheduleReadService,
  ScheduledExportCronCandidate,
} from "./schedule-service";
import { sendResendEmail } from "../email/resend-email.js";
import { HttpError } from "../http-error.js";

export const SCHEDULE_EXPORT_AUTO_DISABLE_FAILURES = 3;

export interface ScheduleExportDelivery {
  send(input: {
    to: string;
    subject: string;
    html: string;
    attachment: {
      filename: string;
      content: Buffer;
      contentType: string;
    };
  }): Promise<void>;
}

export interface ScheduledExportCronResult {
  checked: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * A failure that will fail the same way next week: the export is switched off
 * at once and its screen says why, instead of retrying into silence (BL-225).
 */
class StoppedExport extends Error {}

const UNREADABLE_EXPORT =
  "This scheduled export's saved settings can no longer be read. Edit and save it again.";

export async function runScheduledExportsCron(input: {
  service: ScheduleReadService;
  delivery: ScheduleExportDelivery;
  now?: Date;
  /** Told when even recording a failure failed, so it is not lost. */
  onUnrecordedFailure?: (error: unknown, scheduleId: string) => void;
}): Promise<ScheduledExportCronResult> {
  const now = input.now ?? new Date();
  const candidates = await input.service.listScheduledExportCronCandidates(now);
  const result: ScheduledExportCronResult = {
    checked: candidates.schedules.length + candidates.unreadable.length,
    due: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  // One workspace's broken export never stops another's (BL-272).
  const recordFailure = async (
    schedule: { readonly id: string; readonly workspace_id: string },
    error: unknown,
  ) => {
    result.failed += 1;
    try {
      await input.service.recordScheduledExportFailure({
        workspaceId: schedule.workspace_id,
        scheduleId: schedule.id,
        error: (error as Error).message,
        autoDisableAfter:
          error instanceof StoppedExport
            ? 1
            : SCHEDULE_EXPORT_AUTO_DISABLE_FAILURES,
      });
    } catch (recordError) {
      input.onUnrecordedFailure?.(recordError, schedule.id);
    }
  };

  for (const unreadable of candidates.unreadable) {
    await recordFailure(unreadable, new StoppedExport(UNREADABLE_EXPORT));
  }

  for (const schedule of candidates.schedules) {
    try {
      if (!isScheduledExportDue(schedule, now)) {
        result.skipped += 1;
        continue;
      }
      result.due += 1;
      // The database already dropped deleted locations (Q-C).
      if (!schedule.location_ids.length) {
        throw new StoppedExport("Every location in this export was deleted.");
      }

      const weekStart = weekStartForTimezone(
        now,
        schedule.timezone,
        schedule.week_start_day,
      );
      // Notes stay with a manual download; a scheduled email never carries them (BL-330).
      const settings = { ...schedule.settings, include_notes: false };
      const preview = prepareScheduleExport(
        await previewAsCreator(input.service, schedule, weekStart),
        settings,
      );
      const rendered = await renderScheduledExportAttachment(preview, settings);
      const filename = `schedule-${weekStart}.${rendered.extension}`;
      const subject = `${schedule.workspace_name} schedule for ${weekStart}`;
      const html = `<p>${escapeHtml(schedule.name)} is attached.</p>`;
      const deliveries = await Promise.allSettled(
        schedule.recipients.map((recipient) =>
          input.delivery.send({
            to: recipient,
            subject,
            html,
            attachment: {
              filename,
              content: rendered.content,
              contentType: rendered.contentType,
            },
          }),
        ),
      );
      const delivered = deliveries.filter(
        (delivery) => delivery.status === "fulfilled",
      ).length;
      if (delivered === 0) {
        throw new Error(firstRejectedReason(deliveries) ?? "Email delivery failed");
      }
      await input.service.recordScheduledExportSuccess({
        workspaceId: schedule.workspace_id,
        scheduleId: schedule.id,
        sentAt: now,
        format: settings.format,
        params: {
          week_start: weekStart,
          layout: settings.layout,
          location_ids: schedule.location_ids,
          include_notes: false,
          recipients: schedule.recipients.length,
          delivered,
        },
      });
      result.sent += 1;
    } catch (error) {
      await recordFailure(schedule, error);
    }
  }

  return result;
}

/**
 * The export runs as the person who set it up; the authorization core decides
 * inside the preview whether they still may (BL-101).
 */
async function previewAsCreator(
  service: ScheduleReadService,
  schedule: ScheduledExportCronCandidate,
  weekStart: string,
) {
  try {
    return await service.previewExport({
      actorUserId: schedule.created_by,
      workspaceId: schedule.workspace_id,
      weekStart,
      sourceType: "published",
      sourceDraftId: null,
      locationIds: schedule.location_ids,
    });
  } catch (error) {
    if (error instanceof HttpError && error.reason?.startsWith("authz.")) {
      throw new StoppedExport(
        "The person who set up this export can no longer export these locations.",
      );
    }
    throw error;
  }
}

async function renderScheduledExportAttachment(
  preview: Parameters<typeof renderSchedulePrintHtml>[0],
  settings: Parameters<typeof renderSchedulePrintHtml>[1],
): Promise<{
  readonly content: Buffer;
  readonly contentType: string;
  readonly extension: "csv" | "html" | "pdf" | "xlsx";
}> {
  if (settings.format === "print") {
    return {
      content: Buffer.from(renderSchedulePrintHtml(preview, settings), "utf8"),
      contentType: "text/html; charset=utf-8",
      extension: "html",
    };
  }
  if (settings.format === "pdf") {
    return {
      content: renderSchedulePdf(preview, settings),
      contentType: "application/pdf",
      extension: "pdf",
    };
  }
  if (settings.format === "xlsx") {
    return {
      content: await renderScheduleWorkbook(preview, settings),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  return {
    content: Buffer.from(renderScheduleCsv(preview, settings), "utf8"),
    contentType: "text/csv; charset=utf-8",
    extension: "csv",
  };
}

export function isScheduledExportDue(
  schedule: Pick<
    ScheduledExportCronCandidate,
    "day_of_week" | "send_hour" | "timezone" | "last_sent_at"
  >,
  now: Date,
): boolean {
  if (
    schedule.last_sent_at &&
    now.getTime() - new Date(schedule.last_sent_at).getTime() < 20 * 60 * 60_000
  ) {
    return false;
  }
  if (!isValidIanaTimezone(schedule.timezone)) {
    throw new StoppedExport(
      `The time zone "${schedule.timezone}" is not a real time zone.`,
    );
  }
  const parts = localDateTimeParts(now, schedule.timezone);
  return parts.weekday === schedule.day_of_week && parts.hour === schedule.send_hour;
}

export function weekStartForTimezone(
  now: Date,
  timezone: string,
  weekStartDay: ScheduledExportCronCandidate["week_start_day"] = "monday",
): string {
  const parts = localDateTimeParts(now, timezone);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const offset =
    weekStartDay === "sunday" ? parts.weekday : (parts.weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export function createResendScheduleExportDelivery(input: {
  resendApiKey: string;
  emailFrom: string;
}): ScheduleExportDelivery {
  return {
    send: (message) =>
      sendResendEmail({
        apiKey: input.resendApiKey,
        failure: "Resend rejected schedule export",
        message: { ...message, from: input.emailFrom },
      }),
  };
}

function localDateTimeParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const values = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdayIndex(values.weekday ?? "Sun"),
    hour: Number(values.hour === "24" ? "0" : values.hour),
  };
}

function weekdayIndex(value: string): number {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value);
}

function firstRejectedReason(
  deliveries: readonly PromiseSettledResult<unknown>[],
): string | null {
  const rejected = deliveries.find(
    (delivery): delivery is PromiseRejectedResult =>
      delivery.status === "rejected",
  );
  return rejected ? (rejected.reason as Error).message : null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
