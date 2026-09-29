import { expect, it, vi } from "vitest";
import { createDocumentTypesServiceWithClient } from "./document-types-service";
const input = {
  actorUserId: "actor",
  workspaceId: "workspace",
  documentType: {
    title: "Safety",
    description: "",
    required_at_onboarding: false,
    requires_review: true,
    accepted_formats: ["pdf" as const],
    tracks_expiry: false,
    expiry_warning_days: 30,
    expiry_schedule_impact: "track_only" as const,
  },
};
it("uses a migration-versioned draft Save with fixed active and future assignment scope", async () => {
  const rpc = vi.fn(async () => ({ data: "saved", error: null }));
  const service = createDocumentTypesServiceWithClient({ rpc });
  expect(await service.save(input)).toBe("saved");
  expect(rpc).toHaveBeenCalledWith(
    "save_document_type_draft_service",
    expect.objectContaining({
      actor_user_id: "actor",
      document_payload: expect.objectContaining({
        lifecycle_settings: expect.objectContaining({
          assignment_scope: "all_active",
          target: expect.objectContaining({ employee_ids: [] }),
        }),
      }),
    }),
  );
});
it("fails closed instead of falling back to pre-publication Save when the migration is missing", async () => {
  const rpc = vi.fn(async () => ({
    data: null,
    error: { message: "Could not find the function public.save_document_type_service", code: "PGRST202" },
  }));
  const service = createDocumentTypesServiceWithClient({ rpc });
  await expect(service.save(input)).rejects.toMatchObject({ statusCode: 500 });
  expect(rpc).toHaveBeenCalledTimes(1);
});
