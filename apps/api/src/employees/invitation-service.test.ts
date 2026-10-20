import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEmployeeInvitationService } from "./invitation-service";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const listUsers = vi.fn();
  const updateUserById = vi.fn();
  const createClient = vi.fn(() => ({
    rpc,
    auth: { admin: { listUsers, updateUserById } },
  }));
  return { createClient, listUsers, rpc, updateUserById };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

const actorUserId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const employeeId = "30000000-0000-4000-8000-000000000001";
const invitationId = "40000000-0000-4000-8000-000000000001";
const roleId = "50000000-0000-4000-8000-000000000001";
const managementRoleId = "50000000-0000-4000-8000-000000000002";
const locationId = "60000000-0000-4000-8000-000000000001";
const access = {
  employee_role_id: roleId,
  management_role_id: managementRoleId,
  managed_location_ids: [locationId],
};

beforeEach(() => {
  vi.restoreAllMocks();
  mocks.rpc.mockReset();
  mocks.listUsers.mockReset();
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.updateUserById.mockReset();
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.createClient.mockClear();
});

describe("createEmployeeInvitationService", () => {
  it("sends the invitation email through Resend and marks delivery sent", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "https://app.example.test",
      resendApiKey: "resend-key",
      emailFrom: "Newfork <invite@example.test>",
      production: true,
    });

    await expect(
      service.prepare({
        actorUserId,
        workspaceId,
        employeeId,
        email: "Employee@Example.Test",
        access,
      }),
    ).resolves.toEqual({
      id: invitationId,
      expiresAt: expect.any(String),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer resend-key",
          "Content-Type": "application/json",
          "Idempotency-Key": `employee-invite/${invitationId}`,
        }),
        body: expect.any(String),
      }),
    );
    const [, requestInit] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(requestInit.body)).toMatchObject({
      from: "Newfork <invite@example.test>",
      to: ["Employee@Example.Test"],
      subject: "Join your Newfork workspace",
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "prepare_employee_invitation_service",
      expect.objectContaining({
        employee_email: "employee@example.test",
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "store_employee_invitation_delivery_secret_service",
      expect.objectContaining({
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_invitation_id: invitationId,
        invitation_token: expect.any(String),
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "mark_employee_invitation_delivery_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_invitation_id: invitationId,
        delivery_result: "sent",
        delivery_failure_message: null,
      },
    );
  });

  it("marks delivery failure without revoking the prepared invitation", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 })),
    );

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "https://app.example.test",
      resendApiKey: "resend-key",
      production: true,
    });

    await expect(
      service.prepare({
        actorUserId,
        workspaceId,
        employeeId,
        email: "employee@example.test",
        access,
      }),
    ).rejects.toMatchObject({
      // The invitation stands and is marked failed; the inviter hears a
      // sentence of ours with a status the drawer shows, not the provider's.
      message: "Invitation delivery failed",
      statusCode: 409,
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "prepare_employee_invitation_service",
      expect.objectContaining({
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
        employee_email: "employee@example.test",
        target_employee_role_id: roleId,
        target_management_role_id: managementRoleId,
        target_managed_location_ids: [locationId],
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "store_employee_invitation_delivery_secret_service",
      expect.objectContaining({
        target_invitation_id: invitationId,
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "mark_employee_invitation_delivery_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_invitation_id: invitationId,
        delivery_result: "failed",
        delivery_failure_message: "Invitation delivery failed (503)",
      },
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "revoke_employee_invitation_service",
      expect.anything(),
    );
  });

  it("leaves a locked account locked and answers the inviter the same way", async () => {
    const lockedUser = {
      id: "60000000-0000-4000-8000-000000000001",
      email: "employee@example.test",
      banned_until: "2126-09-28T00:00:00.000Z",
    };
    const invite = async (lockedAccountExists: boolean) => {
      mocks.rpc
        .mockResolvedValueOnce({ data: invitationId, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null });
      mocks.listUsers.mockResolvedValue({
        data: { users: lockedAccountExists ? [lockedUser] : [] },
        error: null,
      });
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200 })));
      const service = createEmployeeInvitationService({
        url: "https://example.supabase.co",
        serviceRoleKey: "service-role",
        appUrl: "https://app.example.test",
        resendApiKey: "resend-key",
        production: true,
      });
      const result = await service.prepare({
        actorUserId,
        workspaceId,
        employeeId,
        email: "Employee@Example.Test",
        access,
      });
      return { ...result, expiresAt: "<expires>" };
    };

    const locked = await invite(true);
    const unlocked = await invite(false);

    expect(locked).toEqual(unlocked);
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });

  it("marks a development invitation as sent after preparing its local link", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: invitationId, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "http://127.0.0.1:5555",
      production: false,
    });

    const result = await service.prepare({
      actorUserId,
      workspaceId,
      employeeId,
      email: "employee@example.test",
      access: { employee_role_id: null, management_role_id: null, managed_location_ids: [] },
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ id: invitationId });
    expect(result.developmentUrl).toContain("/invite/accept?token=");
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "mark_employee_invitation_delivery_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_invitation_id: invitationId,
        delivery_result: "sent",
        delivery_failure_message: null,
      },
    );
  });

  it("retries a failed delivery with the original invitation link", async () => {
    const originalToken = "a".repeat(64);
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          id: invitationId,
          email: "employee@example.test",
          token: originalToken,
          expires_at: "2026-09-16T12:00:00.000Z",
          reminder: false,
          attempt: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "https://app.example.test",
      resendApiKey: "resend-key",
      production: true,
    });

    await expect(
      service.retry({ actorUserId, workspaceId, employeeId }),
    ).resolves.toEqual({
      id: invitationId,
      expiresAt: "2026-09-16T12:00:00.000Z",
    });
    const [, requestInit] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    // Its own key: the provider would drop the first email's as a duplicate.
    expect(requestInit.headers).toMatchObject({
      "Idempotency-Key": `employee-invite/${invitationId}/1`,
    });
    expect(JSON.parse(requestInit.body).html).toContain(
      `/invite/accept?token=${originalToken}`,
    );
    expect(JSON.parse(requestInit.body).subject).toBe(
      "Join your Newfork workspace",
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "load_employee_invitation_retry_service",
      {
        actor_user_id: actorUserId,
        target_workspace_id: workspaceId,
        target_employee_id: employeeId,
      },
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "mark_employee_invitation_delivery_service",
      expect.objectContaining({ delivery_result: "sent" }),
    );
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  // BL-767: Send reminder on an invitation whose email went out sends the
  // same link again, worded as a reminder, and leaves its expiry alone.
  it("sends a reminder with the same link and the same expiry", async () => {
    const originalToken = "b".repeat(64);
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          id: invitationId,
          email: "employee@example.test",
          token: originalToken,
          expires_at: "2026-09-16T12:00:00.000Z",
          reminder: true,
          attempt: 3,
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "https://app.example.test",
      resendApiKey: "resend-key",
      production: true,
    });

    await expect(
      service.retry({ actorUserId, workspaceId, employeeId }),
    ).resolves.toEqual({
      id: invitationId,
      expiresAt: "2026-09-16T12:00:00.000Z",
    });
    const [, requestInit] = fetch.mock.calls[0] as unknown as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(requestInit.headers).toMatchObject({
      "Idempotency-Key": `employee-invite/${invitationId}/3`,
    });
    const body = JSON.parse(requestInit.body) as {
      subject: string;
      html: string;
      to: string[];
    };
    expect(body.to).toEqual(["employee@example.test"]);
    expect(body.subject).toBe("Reminder: join your Newfork workspace");
    expect(body.html).toContain(`/invite/accept?token=${originalToken}`);
    expect(body.html).toContain("same link as before");
    expect(body.html).not.toContain("expires in seven days");
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "mark_employee_invitation_delivery_service",
      expect.objectContaining({ delivery_result: "sent" }),
    );
  });

  it("refuses an answer that does not say whether it is a reminder", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: invitationId,
        email: "employee@example.test",
        token: "c".repeat(64),
        expires_at: "2026-09-16T12:00:00.000Z",
      },
      error: null,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const service = createEmployeeInvitationService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      appUrl: "https://app.example.test",
      resendApiKey: "resend-key",
      production: true,
    });

    await expect(
      service.retry({ actorUserId, workspaceId, employeeId }),
    ).rejects.toThrow("Invitation retry state is invalid");
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("updateAccess", () => {
    const service = () =>
      createEmployeeInvitationService({
        url: "https://example.supabase.co",
        serviceRoleKey: "service-role",
        appUrl: "https://app.example.test",
        production: true,
      });

    it("hands the new access to update_employee_invitation_access_service", async () => {
      mocks.rpc.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        service().updateAccess({ actorUserId, workspaceId, employeeId, access }),
      ).resolves.toBeUndefined();

      expect(mocks.rpc).toHaveBeenCalledTimes(1);
      expect(mocks.rpc).toHaveBeenCalledWith(
        "update_employee_invitation_access_service",
        {
          actor_user_id: actorUserId,
          target_workspace_id: workspaceId,
          target_employee_id: employeeId,
          target_employee_role_id: roleId,
          target_management_role_id: managementRoleId,
          target_managed_location_ids: [locationId],
        },
      );
    });

    it("turns the database refusal into the HttpError with its reason", async () => {
      mocks.rpc.mockResolvedValueOnce({
        data: null,
        error: {
          message: "Not allowed",
          code: "42501",
          hint: "authz.rank",
          details: "employee.invite",
        },
      });

      await expect(
        service().updateAccess({ actorUserId, workspaceId, employeeId, access }),
      ).rejects.toMatchObject({
        statusCode: 403,
        pgCode: "42501",
        reason: "authz.rank",
      });
    });
  });
});
