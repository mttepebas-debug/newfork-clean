import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { managementAndOwnerRefusals } from "@newfork/shared";
import { createEmployeeCreateService } from "./employee-create-service";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { admin: { listUsers: vi.fn(), updateUserById: vi.fn() } },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks }));
const id = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000002";
const command = {
  request_id: id,
  invite_access: {
    employee_role_id: id,
    management_role_id: null,
    managed_location_ids: [],
  },
  employee: {
    first_name: "Ada",
    last_name: "Lovelace",
    preferred_name: "",
    invitation_email: "ada@example.test",
    start_date: "",
    internal_note: "",
    // Remote still needs a location and a job (DAVET-ERISIM).
    location_ids: [id],
    primary_location_id: id,
    job_ids: [id],
    primary_job_id: id,
    is_remote: true,
    expected_revision: null,
  },
};
const options = {
  url: "https://example.supabase.co",
  serviceRoleKey: "test-key",
  appUrl: "https://app.example.test",
  resendApiKey: "test-key",
  production: true,
};
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.auth.admin.listUsers.mockReset();
  mocks.auth.admin.listUsers.mockResolvedValue({
    data: { users: [{ id, email: "ada@example.test" }] },
    error: null,
  });
  mocks.auth.admin.updateUserById.mockReset();
  mocks.auth.admin.updateUserById.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());
describe("employee create service", () => {
  it("returns the saved employee on delivery failure and uses stable delivery identity", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          id,
          invitation_id: invitationId,
          token: "test-token",
          delivery_status: "pending",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const result = await createEmployeeCreateService(options).create(
      id,
      id,
      command,
    );
    expect(result).toEqual({
      id,
      invitation: { id: invitationId, deliveryStatus: "failed" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotency-Key": `employee-invite/${invitationId}`,
        }),
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      1,
      "create_employee_command_service",
      expect.objectContaining({ invite_access: command.invite_access }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      2,
      "store_employee_invitation_delivery_secret_service",
      expect.objectContaining({
        target_invitation_id: invitationId,
        invitation_token: "test-token",
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(
      3,
      "mark_employee_invitation_delivery_service",
      expect.objectContaining({ delivery_result: "failed" }),
    );
    expect(mocks.auth.admin.listUsers).not.toHaveBeenCalled();
    expect(mocks.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it("does not redeliver a successfully completed command", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id,
        invitation_id: invitationId,
        token: "test-token",
        delivery_status: "sent",
      },
      error: null,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (await createEmployeeCreateService(options).create(id, id, command))
        .invitation?.deliveryStatus,
    ).toBe("sent");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the Owner job's primary refusal's key and sentence (BL-218, EMP-001 C)", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23514",
        message: "The Owner job is never marked primary",
        hint: "employee.management_primary",
      },
    });
    await expect(
      createEmployeeCreateService(options).create(id, id, { ...command, invite_access: null }),
    ).rejects.toMatchObject({
      statusCode: 400,
      reason: "employee.management_primary",
      message: managementAndOwnerRefusals["employee.management_primary"],
    });
  });
  // BL-1045: a request key replayed with other details is a standing refusal;
  // the key says so, so nobody mistakes it for "changed meanwhile".
  it("passes the database's employee.create_request_reused key on with the 409", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "PT409",
        message: "idempotency key belongs to different employee details",
        hint: "employee.create_request_reused",
      },
    });
    await expect(
      createEmployeeCreateService(options).create(id, id, { ...command, invite_access: null }),
    ).rejects.toMatchObject({
      statusCode: 409,
      reason: "employee.create_request_reused",
    });
  });
  it("keeps Add employee's missing-primary refusal key and sentence (BL-218 .3b)", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "22023",
        message: "employee requires a primary job",
        hint: "employee.primary_job_required",
      },
    });
    await expect(
      createEmployeeCreateService(options).create(id, id, { ...command, invite_access: null }),
    ).rejects.toMatchObject({
      statusCode: 400,
      reason: "employee.primary_job_required",
      message: managementAndOwnerRefusals["employee.primary_job_required"],
    });
  });
  it("does not send anything for Save even when email is populated", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id, invitation_id: null, token: null, delivery_status: null },
      error: null,
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await createEmployeeCreateService(options).create(id, id, {
        ...command,
        invite_access: null,
      }),
    ).toEqual({ id, invitation: null });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns pending rather than losing a successful create when delivery state update fails", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          id,
          invitation_id: invitationId,
          token: "test-token",
          delivery_status: "pending",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "Unavailable" } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true })),
    );
    expect(
      (await createEmployeeCreateService(options).create(id, id, command))
        .invitation?.deliveryStatus,
    ).toBe("pending");
  });
});
