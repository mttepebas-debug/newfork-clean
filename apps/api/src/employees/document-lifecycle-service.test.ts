import { defaultDocumentLifecycleSettings } from "@newfork/shared";
import { expect, it, vi } from "vitest";
import { createDocumentLifecycleServiceWithClient } from "./document-lifecycle-service";

const workspace = "6ea5d512-bc7f-4cf3-aad4-2f0815de00fd";
const requirement = "97000000-0000-4000-8000-000000000001";

function setup(obligation: { status: string; exemption_locked?: boolean }) {
  const createSignedUploadUrl = vi.fn(async () => ({
    data: { token: "upload-token" },
    error: null,
  }));
  const client = {
    auth: {
      getUser: async () => ({
        data: { user: { id: "d9f43e62-e099-48e1-bc6f-a5aabe8e87d5" } },
        error: null,
      }),
    },
    rpc: async () => ({
      data: {
        obligation: {
          id: requirement,
          workspace_id: workspace,
          employee_id: "fe201916-aa0e-480b-9144-1e1c8da20a31",
          employee_name: "Olivia Owner",
          title: "Food Handler",
          source_id: null,
          kind: "document",
          mode: "required",
          revision: 1,
          requires_review: true,
          deadline_at: null,
          remaining_seconds: null,
          rejection_reason: null,
          suspended: false,
          submitted_id: null,
          approved_id: null,
          location_ids: [],
          location_names: [],
          timezone: null,
          settings: defaultDocumentLifecycleSettings,
          accepted_formats: ["pdf"],
          tracks_expiry: false,
          ...obligation,
        },
        submissions: [],
        history: [],
      },
      error: null,
    }),
    storage: { from: () => ({ createSignedUploadUrl }) },
  };
  const service = createDocumentLifecycleServiceWithClient(client as never);
  return {
    upload: () =>
      service.prepareUpload("token", workspace, requirement, "card.pdf", 1024),
    createSignedUploadUrl,
  };
}

// BL-118 (D5): the owner is excused from the documents they ask of everyone,
// and may still put theirs on file. Nobody else's exemption opens uploading.
it("lets the owner upload to the document they are excused from", async () => {
  const { upload, createSignedUploadUrl } = setup({ status: "exempt", exemption_locked: true });
  await expect(upload()).resolves.toMatchObject({ token: "upload-token" });
  expect(createSignedUploadUrl).toHaveBeenCalledOnce();
});

it.each([
  { status: "exempt", exemption_locked: false },
  { status: "removed" },
  { status: "paused" },
])("keeps a closed obligation closed: $status", async (obligation) => {
  const { upload, createSignedUploadUrl } = setup(obligation);
  await expect(upload()).rejects.toMatchObject({
    statusCode: 400,
    message: "This obligation is closed",
  });
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});
