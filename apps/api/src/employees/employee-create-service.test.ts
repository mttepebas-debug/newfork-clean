import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmployeeCreateService } from "./employee-create-service";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => mocks }));
const id = "10000000-0000-4000-8000-000000000001";
const invitationId = "10000000-0000-4000-8000-000000000002";
const command = {
  request_id: id,
  invite_role_id: id,
  employee: {
    first_name: "Ada",
    last_name: "Lovelace",
    preferred_name: "",
    invitation_email: "ada@example.test",
    start_date: "",
    internal_note: "",
    location_ids: [],
    primary_location_id: null,
    job_ids: [],
    primary_job_id: null,
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
beforeEach(() => mocks.rpc.mockReset());
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
        invite_role_id: null,
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
