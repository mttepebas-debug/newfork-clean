import {
  kioskCaptureInputSchema,
  kioskDeviceLabelInputSchema,
  kioskPinSchema,
} from "@newfork/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { WorkspaceContextResolver } from "../auth/workspace-context";
import type { KioskService } from "./kiosk-service";

const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const deviceParams = workspaceParams.extend({ deviceId: z.string().uuid() });
const employeeParams = workspaceParams.extend({
  employeeId: z.string().uuid(),
});
const enrollmentBody = z.object({
  location_id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
});
const exchangeBody = z.object({
  code: z.string().trim().min(20).max(32),
});
const pinBody = z.object({
  location_id: z.string().uuid(),
  pin: kioskPinSchema,
});
const verificationBody = z.object({
  employee_id: z.string().uuid(),
  pin: kioskPinSchema,
});
const DEVICE_COOKIE = "newfork-kiosk-device";
const ACTION_COOKIE = "newfork-kiosk-action";
const managerPermissions = [
  "kiosk.device.enroll.location",
  "kiosk.device.read.location",
  "kiosk.device.revoke.location",
  "kiosk.pin.reset.location",
  "kiosk.audit.read.location",
] as const;

export function registerKioskRoutes(
  app: FastifyInstance,
  options: {
    service: KioskService | null;
    contextResolver: WorkspaceContextResolver | null;
    secureCookies: boolean;
  },
) {
  app.get("/v1/kiosk", async (request, reply) => {
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    if (!credential)
      return reply.status(401).send({ error: "Active kiosk device required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(await options.service.getDirectory(credential));
    } catch {
      return reply.status(401).send({ error: "Active kiosk device required" });
    }
  });

  app.get("/v1/kiosk/action", async (request, reply) => {
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    const actionToken = readCookie(request.headers.cookie, ACTION_COOKIE);
    if (!credential || !actionToken)
      return reply.status(401).send({ error: "Active kiosk action required" });
    if (!options.service) return unavailable(reply);
    try {
      return reply.send(
        await options.service.getActionState(credential, actionToken),
      );
    } catch {
      clearActionCookie(reply, options.secureCookies);
      return reply.status(401).send({ error: "Active kiosk action required" });
    }
  });

  app.post("/v1/kiosk/actions", async (request, reply) => {
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    const actionToken = readCookie(request.headers.cookie, ACTION_COOKIE);
    const body = kioskCaptureInputSchema.safeParse(request.body);
    if (!body.success)
      return reply.status(400).send({ error: "Valid kiosk action required" });
    if (!credential || !actionToken)
      return reply.status(401).send({ error: "Active kiosk action required" });
    if (!options.service) return unavailable(reply);
    try {
      const result = await options.service.capture(
        credential,
        actionToken,
        body.data,
      );
      clearActionCookie(reply, options.secureCookies);
      return result.status === "conflict"
        ? reply.status(409).send(result)
        : reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("consumed"))
        return reply.status(409).send({ error: "Kiosk action already used" });
      clearActionCookie(reply, options.secureCookies);
      return reply.status(401).send({ error: "Active kiosk action required" });
    }
  });

  app.post("/v1/kiosk/action/cancel", async (request, reply) => {
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    const actionToken = readCookie(request.headers.cookie, ACTION_COOKIE);
    if (options.service && credential && actionToken) {
      await options.service
        .cancel(credential, actionToken)
        .catch(() => undefined);
    }
    clearActionCookie(reply, options.secureCookies);
    return reply.status(204).send();
  });

  app.post(
    "/v1/workspaces/:workspaceId/kiosk/enrollments",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      const body = enrollmentBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid kiosk enrollment required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("kiosk.device.enroll.location") ||
        !canAccessLocation(context, body.data.location_id)
      )
        return reply
          .status(403)
          .send({ error: "Kiosk enrollment access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.status(201).send(
          await options.service.createEnrollment({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            locationId: body.data.location_id,
            label: body.data.label,
          }),
        );
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/kiosk/management",
    async (request, reply) => {
      const params = workspaceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid workspace required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !managerPermissions.some((permission) =>
          context.permissions.includes(permission),
        )
      )
        return reply.status(403).send({ error: "Kiosk access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.getManagement({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
          }),
        );
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/kiosk/devices/:deviceId",
    async (request, reply) => {
      const params = deviceParams.safeParse(request.params);
      const body = kioskDeviceLabelInputSchema.safeParse(request.body);
      if (!params.success || !body.success)
        return reply.status(400).send({ error: "Valid kiosk label required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("kiosk.device.enroll.location")
      )
        return reply
          .status(403)
          .send({ error: "Kiosk update access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.updateLabel({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            deviceId: params.data.deviceId,
            label: body.data.label,
          }),
        );
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.post(
    "/v1/workspaces/:workspaceId/kiosk/devices/:deviceId/re-enrollment",
    async (request, reply) => {
      const params = deviceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid kiosk device required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("kiosk.device.enroll.location") ||
        !context.permissions.includes("kiosk.device.revoke.location")
      )
        return reply
          .status(403)
          .send({ error: "Kiosk re-enrollment access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.status(201).send(
          await options.service.createReenrollment({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            deviceId: params.data.deviceId,
          }),
        );
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.post("/v1/kiosk/enrollments/exchange", async (request, reply) => {
    const body = exchangeBody.safeParse(request.body);
    if (!body.success)
      return reply
        .status(400)
        .send({ error: "Valid enrollment code required" });
    if (!options.service) return unavailable(reply);
    try {
      const result = await options.service.exchange(body.data.code);
      reply.header(
        "Set-Cookie",
        serializeCookie(
          DEVICE_COOKIE,
          result.credential,
          90 * 24 * 60 * 60,
          options.secureCookies,
        ),
      );
      return reply.status(201).send({ device: result.device });
    } catch {
      return reply
        .status(409)
        .send({ error: "Enrollment code is invalid or expired" });
    }
  });

  app.post("/v1/kiosk/device/credentials/rotate", async (request, reply) => {
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    if (!credential)
      return reply.status(401).send({ error: "Active kiosk device required" });
    if (!options.service) return unavailable(reply);
    try {
      const result = await options.service.rotate(credential);
      reply.header(
        "Set-Cookie",
        serializeCookie(
          DEVICE_COOKIE,
          result.credential,
          90 * 24 * 60 * 60,
          options.secureCookies,
        ),
      );
      return reply.send({ device: result.device });
    } catch {
      return reply.status(401).send({ error: "Active kiosk device required" });
    }
  });

  app.delete(
    "/v1/workspaces/:workspaceId/kiosk/devices/:deviceId",
    async (request, reply) => {
      const params = deviceParams.safeParse(request.params);
      if (!params.success)
        return reply.status(400).send({ error: "Valid kiosk device required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("kiosk.device.revoke.location")
      )
        return reply
          .status(403)
          .send({ error: "Kiosk revocation access required" });
      if (!options.service) return unavailable(reply);
      try {
        await options.service.revoke({
          actorUserId: context.userId,
          workspaceId: params.data.workspaceId,
          deviceId: params.data.deviceId,
        });
        return reply.status(204).send();
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/kiosk/employees/:employeeId/pin",
    async (request, reply) => {
      const params = employeeParams.safeParse(request.params);
      const body = pinBody.safeParse(request.body);
      if (!params.success || !body.success)
        return reply
          .status(400)
          .send({ error: "Valid six-digit kiosk PIN required" });
      const context = await authorize(
        request.headers.authorization,
        params.data.workspaceId,
        options.contextResolver,
      );
      if (
        !context ||
        !context.permissions.includes("kiosk.pin.reset.location") ||
        !canAccessLocation(context, body.data.location_id)
      )
        return reply
          .status(403)
          .send({ error: "Kiosk PIN reset access required" });
      if (!options.service) return unavailable(reply);
      try {
        return reply.send(
          await options.service.setPin({
            actorUserId: context.userId,
            workspaceId: params.data.workspaceId,
            locationId: body.data.location_id,
            employeeId: params.data.employeeId,
            pin: body.data.pin,
          }),
        );
      } catch (error) {
        return managerError(reply, error);
      }
    },
  );

  app.post("/v1/kiosk/verify", async (request, reply) => {
    const body = verificationBody.safeParse(request.body);
    const credential = readCookie(request.headers.cookie, DEVICE_COOKIE);
    if (!body.success || !credential)
      return reply.status(401).send({ error: "Kiosk verification failed" });
    if (!options.service) return unavailable(reply);
    try {
      const result = await options.service.verify({
        credential,
        employeeId: body.data.employee_id,
        pin: body.data.pin,
      });
      if (result.status === "rate_limited")
        return reply
          .status(429)
          .send({ error: "Kiosk verification temporarily unavailable" });
      if (result.status !== "verified")
        return reply.status(401).send({ error: "Kiosk verification failed" });
      reply.header(
        "Set-Cookie",
        serializeCookie(
          ACTION_COOKIE,
          result.actionToken,
          60,
          options.secureCookies,
        ),
      );
      return reply.send({ verified: true, expires_at: result.expiresAt });
    } catch {
      return reply.status(401).send({ error: "Kiosk verification failed" });
    }
  });
}

async function authorize(
  authorization: string | undefined,
  workspaceId: string,
  resolver: WorkspaceContextResolver | null,
) {
  if (!resolver || !authorization?.startsWith("Bearer ")) return null;
  const context = await resolver.resolve(authorization.slice(7).trim());
  return context?.workspace.id === workspaceId &&
    context.membership.status === "active"
    ? context
    : null;
}

function canAccessLocation(
  context: NonNullable<Awaited<ReturnType<typeof authorize>>>,
  locationId: string,
): boolean {
  return (
    context.locationScope.allLocations ||
    context.locationScope.locationIds.includes(locationId)
  );
}

function readCookie(header: string | undefined, name: string): string {
  if (!header) return "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function serializeCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): string {
  return `${name}=${encodeURIComponent(value)}; Path=/v1/kiosk; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function clearActionCookie(reply: FastifyReply, secure: boolean) {
  reply.header("Set-Cookie", serializeCookie(ACTION_COOKIE, "", 0, secure));
}

function unavailable(reply: FastifyReply) {
  return reply.status(503).send({ error: "Kiosk service is not configured" });
}

function managerError(reply: FastifyReply, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Kiosk operation failed";
  if (message.includes("denied") || message.includes("required"))
    return reply.status(403).send({ error: message });
  if (message.includes("not found"))
    return reply.status(404).send({ error: message });
  return reply.status(409).send({ error: message });
}
