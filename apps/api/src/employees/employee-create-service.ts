import {
  employeeCreateCommandSchema,
  type EmployeeCreateCommand,
  type EmployeeCreateResult,
} from "@newfork/shared";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { rpcFailure } from "../http-error";
import {
  deliverInvitation,
  storeDeliverySecret,
  type ServiceOptions,
} from "./invitation-service";

export interface EmployeeCreateService {
  create(
    actorUserId: string,
    workspaceId: string,
    command: EmployeeCreateCommand,
  ): Promise<EmployeeCreateResult>;
}

const storedResult = z.object({
  id: z.string().uuid(),
  invitation_id: z.string().uuid().nullable(),
  token: z.string().nullable(),
  delivery_status: z.enum(["pending", "sent", "failed"]).nullable(),
});

export function createEmployeeCreateService(
  options: ServiceOptions,
): EmployeeCreateService {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return {
    async create(actorUserId, workspaceId, input) {
      const command = employeeCreateCommandSchema.parse(input);
      const { data, error } = await client.rpc(
        "create_employee_command_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          command_id: command.request_id,
          employee_input: command.employee,
          invite_access: command.invite_access,
        },
      );
      if (error) throw rpcFailure(error);
      const result = storedResult.parse(data);
      if (!result.invitation_id) return { id: result.id, invitation: null };
      let deliveryStatus = result.delivery_status ?? "pending";
      const url = result.token
        ? `${options.appUrl.replace(/\/$/, "")}/invite/accept?token=${result.token}`
        : undefined;
      if (deliveryStatus !== "sent" && url) {
        try {
          await storeDeliverySecret(client, {
            actorUserId,
            workspaceId,
            invitationId: result.invitation_id,
            token: result.token!,
          });
          await deliverInvitation(
            options,
            command.employee.invitation_email.trim().toLowerCase(),
            url,
            `employee-invite/${result.invitation_id}`,
          );
          deliveryStatus = "sent";
        } catch {
          deliveryStatus = "failed";
        }
        const marked = await client.rpc(
          "mark_employee_invitation_delivery_service",
          {
            actor_user_id: actorUserId,
            target_workspace_id: workspaceId,
            target_invitation_id: result.invitation_id,
            delivery_result: deliveryStatus,
            delivery_failure_message:
              deliveryStatus === "failed" ? "Invitation delivery failed" : null,
          },
        );
        // The employee already exists. Never turn a delivery bookkeeping failure into a create failure.
        if (marked.error) deliveryStatus = "pending";
      }
      return {
        id: result.id,
        invitation: {
          id: result.invitation_id,
          deliveryStatus,
          ...(!options.production && url ? { developmentUrl: url } : {}),
        },
      };
    },
  };
}
