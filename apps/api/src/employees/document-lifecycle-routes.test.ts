import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerDocumentLifecycleRoutes } from "./document-lifecycle-routes";
import {
  DocumentLifecycleError,
  documentBytesMatchFormat,
  type DocumentLifecycleService,
} from "./document-lifecycle-service";

const workspace = "00000000-0000-4000-8000-000000000001";
const requirement = "00000000-0000-4000-8000-000000000002";
const submission = "00000000-0000-4000-8000-000000000003";
function setup() {
  const service = {
    assignmentPreview: vi.fn(),
    extendDeadline: vi.fn(),
    removeDraftFile: vi.fn(),
    withdraw: vi.fn(),
    acknowledge: vi.fn(),
    access: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    detail: vi.fn(),
    prepareUpload: vi.fn(),
    confirmUpload: vi.fn(),
    submit: vi.fn(),
    review: vi.fn().mockResolvedValue(2),
    exemption: vi.fn(),
    defer: vi.fn(),
    setTimezone: vi.fn(),
    download: vi.fn(),
  } satisfies DocumentLifecycleService;
  const app = Fastify();
  registerDocumentLifecycleRoutes(app, service);
  return { app, service };
}
describe("document routes", () => {
  it("rejects missing authentication before reading private data", async () => {
    const { app, service } = setup();
    expect(
      (await app.inject({ url: `/v1/me/workspaces/${workspace}/documents` }))
        .statusCode,
    ).toBe(401);
    expect(service.list).not.toHaveBeenCalled();
    await app.close();
  });
  it("keeps self and manager audience distinct and cannot be overridden by a query", async () => {
    const { app, service } = setup();
    await app.inject({
      url: `/v1/me/workspaces/${workspace}/documents?selfOnly=false`,
      headers: { authorization: "Bearer test" },
    });
    expect(service.list).toHaveBeenLastCalledWith("test", {
      workspaceId: workspace,
      selfOnly: true,
    });
    await app.inject({
      url: `/v1/workspaces/${workspace}/employee-documents`,
      headers: { authorization: "Bearer test" },
    });
    expect(service.list).toHaveBeenLastCalledWith("test", {
      workspaceId: workspace,
      selfOnly: false,
    });
    await app.close();
  });
  it("requires a reason, preserves correction choice and maps stale decisions to 409", async () => {
    const { app, service } = setup();
    const request = {
      method: "POST" as const,
      url: `/v1/workspaces/${workspace}/employee-documents/${requirement}/review`,
      headers: { authorization: "Bearer test" },
      payload: {
        revision: 1,
        submission_id: submission,
        decision: "reject",
        files: [{ id: submission, decision: "keep" }],
      },
    };
    expect((await app.inject(request)).statusCode).toBe(400);
    expect(service.review).not.toHaveBeenCalled();
    service.review.mockRejectedValue(
      new DocumentLifecycleError("document changed; refresh required", "PT409"),
    );
    const response = await app.inject({
      ...request,
      payload: {
        ...request.payload,
        reason: "Unreadable",
        correction_period: "remaining",
      },
    });
    expect(response.statusCode).toBe(409);
    expect(service.review.mock.calls[0]?.[3]).toMatchObject({
      revision: 1,
      submission_id: submission,
      correction_period: "remaining",
    });
    await app.close();
  });
  it("offers no manager-on-behalf upload route", async () => {
    const { app } = setup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspace}/employee-documents/${requirement}/upload-url`,
          headers: { authorization: "Bearer test" },
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });
  it("does not convert forbidden or absent private records into successful responses", async () => {
    const { app, service } = setup();
    service.list.mockRejectedValue(
      new DocumentLifecycleError("employee document access required", "42501"),
    );
    expect(
      (
        await app.inject({
          url: `/v1/workspaces/${workspace}/employee-documents`,
          headers: { authorization: "Bearer test" },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });
});
describe("document content signature check", () => {
  it("rejects executable bytes renamed as each supported format", () => {
    for (const format of ["pdf", "jpeg", "png", "webp"] as const)
      expect(
        documentBytesMatchFormat(
          new TextEncoder().encode("MZ executable"),
          format,
        ),
      ).toBe(false);
  });
  it("recognizes supported signatures without claiming malware detection", () => {
    expect(
      documentBytesMatchFormat(new TextEncoder().encode("%PDF-1.7"), "pdf"),
    ).toBe(true);
    expect(
      documentBytesMatchFormat(new Uint8Array([255, 216, 255]), "jpeg"),
    ).toBe(true);
    expect(
      documentBytesMatchFormat(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        "png",
      ),
    ).toBe(true);
    expect(
      documentBytesMatchFormat(
        new TextEncoder().encode("RIFF0000WEBP"),
        "webp",
      ),
    ).toBe(true);
  });
});
