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

export const SCHEDULE_EXPORT_AUTO_DISABLE_FAILURES = 3;

export interface ScheduleExportDelivery {
  send(input: {
    to: string;
    subject: string;
    html: string;
    attachment: {
      filename: string;
      content: string;
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

export async function runScheduledExportsCron(input: {
  service: ScheduleReadService;
  delivery: ScheduleExportDelivery;
  now?: Date;
}): Promise<ScheduledExportCronResult> {
  const now = input.now ?? new Date();
  const candidates = await input.service.listScheduledExportCronCandidates(now);
  const result: ScheduledExportCronResult = {
    checked: candidates.schedules.length,
    due: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (const schedule of candidates.schedules) {
    if (!isScheduledExportDue(schedule, now)) {
      result.skipped += 1;
      continue;
    }

    result.due += 1;
    try {
      const weekStart = weekStartForTimezone(now, schedule.timezone);
      const preview = prepareScheduleExport(
        await input.service.previewExport({
          actorUserId: schedule.created_by,
          workspaceId: schedule.workspace_id,
          weekStart,
          sourceType: "published",
          sourceDraftId: null,
          locationIds: schedule.location_ids,
        }),
        schedule.settings,
      );
      const rendered = await renderScheduledExportAttachment(
        preview,
        schedule.settings,
      );
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
        format: schedule.settings.format,
        params: {
          week_start: weekStart,
          layout: schedule.settings.layout,
          location_ids: schedule.location_ids,
          recipients: schedule.recipients.length,
          delivered,
        },
      });
      result.sent += 1;
    } catch (error) {
      await input.service.recordScheduledExportFailure({
        workspaceId: schedule.workspace_id,
        scheduleId: schedule.id,
        error: (error as Error).message,
        autoDisableAfter: SCHEDULE_EXPORT_AUTO_DISABLE_FAILURES,
      });
      result.failed += 1;
    }
  }

  return result;
}

async function renderScheduledExportAttachment(
  preview: Parameters<typeof renderSchedulePrintHtml>[0],
  settings: Parameters<typeof renderSchedulePrintHtml>[1],
): Promise<{
  readonly content: string;
  readonly contentType: string;
  readonly extension: "csv" | "html" | "pdf" | "xlsx";
}> {
  if (settings.format === "print") {
    return {
      content: renderSchedulePrintHtml(preview, settings),
      contentType: "text/html; charset=utf-8",
      extension: "html",
    };
  }
  if (settings.format === "pdf") {
    return {
      content: renderSchedulePdf(preview, settings).toString("base64"),
      contentType: "application/pdf",
      extension: "pdf",
    };
  }
  if (settings.format === "xlsx") {
    return {
      content: (await renderScheduleWorkbook(preview, settings)).toString("base64"),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  return {
    content: renderScheduleCsv(preview, settings),
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
  const parts = localDateTimeParts(now, schedule.timezone);
  return parts.weekday === schedule.day_of_week && parts.hour === schedule.send_hour;
}

export function weekStartForTimezone(now: Date, timezone: string): string {
  const parts = localDateTimeParts(now, timezone);
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const mondayOffset = (parts.weekday + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function createResendScheduleExportDelivery(input: {
  resendApiKey: string;
  emailFrom: string;
}): ScheduleExportDelivery {
  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: input.emailFrom,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          attachments: [
            {
              filename: message.attachment.filename,
              content: Buffer.from(message.attachment.content).toString("base64"),
              content_type: message.attachment.contentType,
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Resend rejected schedule export: ${response.status}`);
      }
    },
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
