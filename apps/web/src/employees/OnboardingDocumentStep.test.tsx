// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
  type EmployeeOnboardingRequirement,
} from "@newfork/shared";
import { OnboardingDocumentStep } from "./OnboardingDocumentStep";
import {
  acknowledgeDocument,
  getDocument,
  removeDocumentDraftFile,
  submitDocument,
  uploadDocument,
} from "../documents/document-data";

vi.mock("../documents/document-data", () => ({
  documentQueryKey: (a: { workspaceId: string }, u: string, id: string) => [
    "document-lifecycle",
    u,
    a.workspaceId,
    id,
  ],
  acknowledgeDocument: vi.fn(),
  deferInitialDocument: vi.fn(),
  downloadDocument: vi.fn(),
  getDocument: vi.fn(),
  removeDocumentDraftFile: vi.fn(),
  submitDocument: vi.fn(),
  uploadDocument: vi.fn(),
  withdrawDocumentAcknowledgement: vi.fn(),
}));

const requirement: EmployeeOnboardingRequirement = {
  id: "requirement",
  kind: "document",
  title: "Food handler card",
  description: "The card your county issues after the class.",
  status: "not_started",
  required: true,
  blocks_activation: true,
  requires_review: true,
  sort_order: 10,
  source_id: null,
  accepted_formats: ["pdf"],
  content_text: null,
  content_digest: null,
  intent_statement: null,
  rejection_reason: null,
} as EmployeeOnboardingRequirement;

/** A document with a draft file waiting to be submitted. */
const withDraft = (
  over: Partial<DocumentDetail["obligation"]> = {},
  metadata: Record<string, string> = {},
): DocumentDetail => ({
  obligation: {
    id: "obligation",
    workspace_id: "workspace",
    employee_id: "employee",
    employee_name: "Taylor Reed",
    title: "Food handler card",
    source_id: "definition",
    kind: "document",
    mode: "required",
    status: "missing",
    revision: 3,
    requires_review: true,
    deadline_at: null,
    remaining_seconds: null,
    rejection_reason: null,
    suspended: false,
    submitted_id: null,
    approved_id: null,
    location_ids: [],
    location_names: [],
    timezone: "America/Los_Angeles",
    settings: { ...defaultDocumentLifecycleSettings, mode: "required" },
    accepted_formats: ["pdf", "jpeg"],
    tracks_expiry: false,
    ...over,
  },
  submissions: [
    {
      id: "draft",
      version: 1,
      state: "draft",
      submitted_at: null,
      reviewed_at: null,
      expiry_date: null,
      metadata,
      rejection_reason: null,
      files: [
        {
          id: "file",
          filename: "card.pdf",
          media_type: "application/pdf",
          size_bytes: 2048,
          decision: "keep",
          note: "",
        },
      ],
    },
  ],
  history: [],
});

const policy = (): DocumentDetail => ({
  ...withDraft({ kind: "acknowledgement", accepted_formats: [] }),
  submissions: [],
  policy: {
    content_text: "Keep the walk-in closed.",
    content_digest: "a".repeat(64),
    intent_statement: "I have read the policy and I agree to follow it.",
    can_withdraw: false,
    history: [],
    evidence: null,
  },
});

function page(onDone = vi.fn(async () => undefined)) {
  const go = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <OnboardingDocumentStep
        workspaceId="workspace"
        userId="user"
        requirement={requirement}
        badge={<span>To do</span>}
        back={{ label: "Documents", go }}
        onDone={onDone}
      />
    </QueryClientProvider>,
  );
  return { onDone, go };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocument).mockResolvedValue(withDraft());
  vi.mocked(submitDocument).mockResolvedValue({});
  vi.mocked(acknowledgeDocument).mockResolvedValue({});
  vi.mocked(uploadDocument).mockResolvedValue({});
  vi.mocked(removeDocumentDraftFile).mockResolvedValue({});
});

describe("OnboardingDocumentStep", () => {
  it("submits the draft and only then moves on", async () => {
    const { onDone } = page();
    const submit = await screen.findByRole("button", {
      name: /submit and continue/i,
    });
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.click(submit);
    await waitFor(() => expect(submitDocument).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("will not submit a document that tracks expiry until the date is there", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft({ tracks_expiry: true }));
    page();
    const submit = await screen.findByRole("button", {
      name: /submit and continue/i,
    });
    // The server refuses a null expiry date on this document; the drawer let the
    // save go out and fail, this page does not offer it.
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Expiry date on the document"), {
      target: { value: "2027-04-01" },
    });
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(
        { workspaceId: "workspace", selfOnly: true },
        "obligation",
        expect.objectContaining({ expiry_date: "2027-04-01" }),
      ),
    );
  });

  it("keeps a typed expiry date when a second file is uploaded", async () => {
    // The upload bumps the revision. The shared drawer keys its content on that
    // and remounts, which silently threw away whatever was typed.
    vi.mocked(getDocument)
      .mockResolvedValueOnce(withDraft({ tracks_expiry: true }))
      .mockResolvedValue(withDraft({ tracks_expiry: true, revision: 4 }));
    page();
    const date = await screen.findByLabelText("Expiry date on the document");
    fireEvent.change(date, { target: { value: "2027-04-01" } });
    fireEvent.change(screen.getByLabelText(/choose a file|add another file/i), {
      target: { files: [new File(["x"], "back.pdf")] },
    });
    await waitFor(() => expect(uploadDocument).toHaveBeenCalledOnce());
    expect(
      screen.getByLabelText("Expiry date on the document"),
    ).toHaveProperty("value", "2027-04-01");
  });

  it("holds the submit until every required extra field is filled", async () => {
    vi.mocked(getDocument).mockResolvedValue(
      withDraft({
        settings: {
          ...defaultDocumentLifecycleSettings,
          extra_fields: [
            { key: "number", label: "Card number", kind: "text", required: true },
          ],
        },
      }),
    );
    page();
    const submit = await screen.findByRole("button", {
      name: /submit and continue/i,
    });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Card number"), {
      target: { value: "  " },
    });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Card number"), {
      target: { value: "8841" },
    });
    expect(submit).toHaveProperty("disabled", false);
  });

  it("asks for the tick and the employee's own name before a policy counts", async () => {
    vi.mocked(getDocument).mockResolvedValue(policy());
    const { onDone } = page();
    const confirm = await screen.findByRole("button", {
      name: /acknowledge and continue/i,
    });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.click(
      screen.getByText("I have read the policy and I agree to follow it."),
    );
    fireEvent.change(screen.getByLabelText(/type your name/i), {
      target: { value: "Someone Else" },
    });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/type your name/i), {
      target: { value: "  taylor   reed " },
    });
    expect(confirm).toHaveProperty("disabled", false);
    fireEvent.click(confirm);
    await waitFor(() => expect(acknowledgeDocument).toHaveBeenCalledOnce());
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("clearing the tick forgets the typed name", async () => {
    vi.mocked(getDocument).mockResolvedValue(policy());
    page();
    const intent = await screen.findByText(
      "I have read the policy and I agree to follow it.",
    );
    fireEvent.click(intent);
    fireEvent.change(screen.getByLabelText(/type your name/i), {
      target: { value: "Taylor Reed" },
    });
    fireEvent.click(intent);
    fireEvent.click(intent);
    expect(screen.getByLabelText(/type your name/i)).toHaveProperty("value", "");
    expect(
      screen.getByRole("button", { name: /acknowledge and continue/i }),
    ).toHaveProperty("disabled", true);
  });

  it("offers a plain Continue once the policy is signed", async () => {
    vi.mocked(getDocument).mockResolvedValue({
      ...policy(),
      policy: {
        ...policy().policy!,
        evidence: {
          typed_name: "Taylor Reed",
          executed_at: "2026-09-17T10:00:00Z",
          content_digest: "a".repeat(64),
          intent_statement: "I have read the policy and I agree to follow it.",
        },
      },
    });
    const { onDone } = page();
    fireEvent.click(await screen.findByRole("button", { name: /^continue/i }));
    expect(acknowledgeDocument).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
  });

  it("offers exactly one way back, and it names the group it came from", async () => {
    const { go } = page();
    const backs = await screen.findAllByRole("button", { name: /documents/i });
    expect(backs).toHaveLength(1);
    fireEvent.click(backs[0]!);
    expect(go).toHaveBeenCalled();
  });
});
