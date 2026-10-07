import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createResendScheduleExportDelivery,
  runScheduledExportsCron,
  type ScheduleExportDelivery,
} from "./schedule-export-cron";
import type { ScheduleReadService } from "./schedule-service";
import { hasCronSecret } from "../cron-secret";

export interface ScheduleExportCronRouteOptions {
  readonly service: ScheduleReadService | null;
  readonly cronSecret?: string;
  readonly delivery?: ScheduleExportDelivery | null;
  readonly resendApiKey?: string;
  readonly emailFrom?: string;
  readonly now?: () => Date;
}

export function registerScheduleExportCronRoutes(
  app: FastifyInstance,
  options: ScheduleExportCronRouteOptions,
) {
  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!options.service)
      return reply
        .status(503)
        .send({ error: "Schedule service is not configured" });
    if (!options.cronSecret)
      return reply.status(503).send({ error: "Schedule cron is not configured" });
    if (!hasCronSecret(request, options.cronSecret))
      return reply.status(401).send({ error: "Invalid cron secret" });

    const delivery =
      options.delivery ??
      (options.resendApiKey
        ? createResendScheduleExportDelivery({
            resendApiKey: options.resendApiKey,
            emailFrom: options.emailFrom ?? "schedule@newfork.local",
          })
        : null);
    if (!delivery) {
      // U63: without RESEND_API_KEY no scheduled export can leave; say so where the host logs it.
      request.log.error(
        "Scheduled exports cannot be emailed: RESEND_API_KEY is not set",
      );
      return reply.status(503).send({ error: "Email delivery is not configured" });
    }

    return reply.send(
      await runScheduledExportsCron({
        service: options.service,
        delivery,
        now: options.now?.(),
        onUnrecordedFailure: (error, scheduleId) =>
          request.log.error(
            { err: error, scheduleId },
            "Scheduled export failed and the failure could not be recorded",
          ),
      }),
    );
  };

  app.get("/internal/cron/scheduled-exports", handler);
  app.post("/internal/cron/scheduled-exports", handler);
}
