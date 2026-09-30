import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
} from "@newfork/shared";
import { DocumentReviewDrawer } from "./DocumentReviewDrawer";
import {
  acknowledgeDocument,
  deferInitialDocument,
  getDocument,
  removeDocumentDraftFile,
  reviewDocument,
  setDocumentExemption,
  submitDocument,
  uploadDocument,
  withdrawDocumentAcknowledgement,
} from "./document-data";

vi.mock("./document-data", () => ({
  documentQueryKey: (a: { workspaceId: string }, u: string, id: string) => [
    "document-lifecycle",
    u,
    a.workspaceId,
    id,
  ],
  extendDocumentDeadline: vi.fn(),
  removeDocumentDraftFile: vi.fn(),
  withdrawDocumentAcknowledgement: vi.fn(),
  acknowledgeDocument: vi.fn(),
  deferInitialDocument: vi.fn(),
  getDocument: vi.fn(),
  reviewDocument: vi.fn(),
  setDocumentExemption: vi.fn(),
  setDocumentTimezone: vi.fn(),
  downloadDocument: vi.fn(),
  submitDocument: vi.fn(),
  uploadDocument: vi.fn(),
}));
const detail = (): DocumentDetail => ({
  obligation: {
    id: "requirement",
    workspace_id: "workspace",
    employee_id: "employee",
    employee_name: "Test Employee",
    title: "Safety certificate",
    source_id: "definition",
    kind: "document",
    mode: "conditional",
    status: "pending_review",
    revision: 1,
    requires_review: true,
    deadline_at: null,
    remaining_seconds: 0,
    rejection_reason: null,
    suspended: false,
    submitted_id: "submission",
    approved_id: null,
    location_ids: [],
    location_names: [],
    timezone: "America/Los_Angeles",
    settings: {
      ...defaultDocumentLifecycleSettings,
      mode: "conditional",
      period_days: 7,
    },
    accepted_formats: ["pdf"],
    tracks_expiry: false,
  },
  submissions: [
    {
      id: "submission",
      version: 1,
      state: "pending_review",
      submitted_at: "2026-09-15T12:00:00Z",
      reviewed_at: null,
      expiry_date: null,
      metadata: {},
      rejection_reason: null,
      files: [
        {
          id: "file",
          filename: "certificate.pdf",
          media_type: "application/pdf",
          size_bytes: 100,
          decision: "keep",
          note: "",
        },
      ],
    },
  ],
  history: [],
});
function page(selfOnly = false) {
  const onClose = vi.fn(),
    onNext = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Every mutation ends in the same refresh; the spy is how a test pins it.
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const drawer = (requirementId: string) => (
    <QueryClientProvider client={cache}>
      <DocumentReviewDrawer
        audience={{ workspaceId: "workspace", selfOnly }}
        userId="user"
        requirementId={requirementId}
        canReview={!selfOnly}
        onClose={onClose}
        onNext={onNext}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(drawer("requirement"));
  // The list keeps one drawer mounted and only changes which document it shows.
  const show = (requirementId: string) => rerender(drawer(requirementId));
  return { onClose, onNext, invalidate, cache, show };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocument).mockResolvedValue(detail());
  vi.mocked(reviewDocument).mockResolvedValue({});
  vi.mocked(setDocumentExemption).mockResolvedValue({});
});
describe("shared document review", () => {
  it("describes only formats accepted by the current obligation", async () => {
    const draft = detail();
    draft.obligation.status = "missing";
    draft.obligation.submitted_id = null;
    draft.submissions = [];
    vi.mocked(getDocument).mockResolvedValue(draft);
    page(true);
    const upload = await screen.findByLabelText("Upload document");
    expect(upload.getAttribute("accept")).toBe(".pdf");
    expect(screen.getByText(/PDF, up to 10 MiB/)).toBeTruthy();
    expect(screen.queryByText(/JPEG, PNG or WebP/)).toBeNull();
  });
  it("keeps successful draft files and blocks Submit until a failed upload is removed", async () => {
    const draft = detail();
    draft.obligation.status = "missing";
    draft.obligation.submitted_id = null;
    draft.submissions[0]!.state = "draft";
    draft.submissions[0]!.submitted_at = null;
    vi.mocked(getDocument).mockResolvedValue(draft);
    vi.mocked(uploadDocument).mockRejectedValue(
      new Error("Upload unavailable"),
    );
    page(true);
    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    expect(submit).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [
          new File(["pdf"], "replacement.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await screen.findByRole("button", { name: "Retry upload" });
    expect(submit).toHaveProperty("disabled", true);
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove failed upload" }),
    );
    expect(submit).toHaveProperty("disabled", false);
    expect(screen.getByText("certificate.pdf")).toBeTruthy();
    expect(uploadDocument).toHaveBeenCalledOnce();
  });
  it("requires rejection reason, disables exhausted remaining time, keeps the drawer open and advances only on Next", async () => {
    const { onClose, onNext } = page();
    const reject = await screen.findByRole("button", { name: "Reject" });
    expect(reject).toHaveProperty("disabled", true);
    expect(
      screen.getByRole("option", { name: "Remaining time" }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    const after = detail();
    after.obligation.revision = 2;
    after.obligation.status = "rejected";
    after.submissions[0]!.state = "rejected";
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(reject);
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        expect.objectContaining({
          revision: 1,
          decision: "reject",
          correction_period: "full",
          reason: "Unreadable",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Reject" })).toBeNull(),
    );
    expect(
      screen.getByRole("heading", { name: "Safety certificate" }),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledOnce();
  });
  it("requires an exemption reason and locks parent navigation while the action is being confirmed", async () => {
    const { onClose } = page();
    fireEvent.click(
      await screen.findByRole("button", { name: "Exempt from this document" }),
    );
    expect(screen.getByRole("button", { name: "Next" })).toHaveProperty(
      "disabled",
      true,
    );
    const group = screen.getByRole("group", {
      name: "Exempt from this document",
    });
    expect(
      within(group).getByRole("button", { name: "Exempt from this document" }),
    ).toHaveProperty("disabled", true);
    fireEvent.change(within(group).getByLabelText("Reason"), {
      target: { value: "Role exception" },
    });
    const after = detail();
    after.obligation.revision = 2;
    after.obligation.status = "exempt";
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(
      within(group).getByRole("button", { name: "Exempt from this document" }),
    );
    await waitFor(() =>
      expect(setDocumentExemption).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        { revision: 1, exempt: true, reason: "Role exception" },
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Remove exemption" }),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  // The owner asked for the document in the first place. Taking their excuse
  // away is refused by the service, so the button is not offered.
  it("explains the owner's standing excuse instead of offering to lift it", async () => {
    const owner = detail();
    owner.obligation.status = "exempt";
    owner.obligation.exemption_locked = true;
    vi.mocked(getDocument).mockResolvedValue(owner);
    page();

    expect(
      await screen.findByText(/not asked for the documents they ask of everyone/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove exemption" }),
    ).toBeNull();
  });

  it("never offers manager review or exemption on the employee's own surface", async () => {
    page(true);
    await screen.findByRole("heading", { name: "Safety certificate" });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Exempt from this document" }),
    ).toBeNull();
    expect(screen.getByLabelText("Upload document")).toBeTruthy();
  });
});

it("keeps paused document evidence readable while upload and review controls are absent",async()=>{
 const paused=detail();paused.obligation.status="paused";paused.obligation.publication_paused=true;
 vi.mocked(getDocument).mockResolvedValue(paused);page();
 await screen.findByText("certificate.pdf");
 expect(screen.queryByRole("button",{name:"Approve"})).toBeNull();
 expect(screen.queryByRole("button",{name:"Reject"})).toBeNull();
 expect(screen.queryByLabelText("Upload document")).toBeNull();
 expect(screen.queryByRole("button",{name:"Submit document"})).toBeNull();
 expect(reviewDocument).not.toHaveBeenCalled();
});

// Characterization of the employee's own surface (Account > Documents): what
// the drawer does today, odd corners included, so a rewrite has an oracle.
const employee = { workspaceId: "workspace", selfOnly: true };
// Every mutation but download ends in the same refresh: the drawer's own
// document and the onboarding step list that embeds it.
function expectRefreshed(invalidate: ReturnType<typeof page>["invalidate"]) {
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["document-lifecycle", "user", "workspace"],
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["my-employee-onboarding", "workspace"],
  });
  // BL-278 (3): the account badge counts documents still to act on.
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["account-attention"] });
}
// The employee's side of the same document: nothing submitted yet, one draft.
function withDraft() {
  const doc = detail();
  doc.obligation.status = "missing";
  doc.obligation.submitted_id = null;
  doc.submissions[0]!.state = "draft";
  doc.submissions[0]!.submitted_at = null;
  return doc;
}
function missing() {
  const doc = withDraft();
  doc.submissions = [];
  return doc;
}
const digest = "a".repeat(64);
const intent = "I have read and understood this policy";
const evidence = {
  typed_name: "Test Employee",
  executed_at: "2026-09-16T09:00:00Z",
  content_digest: digest,
  intent_statement: intent,
};
// The acknowledgement kind: policy text and a typed signature instead of files.
function policyDetail(acknowledged: typeof evidence | null = null) {
  const doc = missing();
  doc.obligation.kind = "acknowledgement";
  doc.obligation.title = "Code of conduct";
  if (acknowledged) doc.obligation.status = "completed";
  doc.policy = {
    content_text: "Be kind.",
    content_digest: digest,
    intent_statement: intent,
    can_withdraw: false,
    history: [],
    evidence: acknowledged,
  };
  return doc;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const closed = ["paused", "removed", "exempt"] as const;

describe("employee surface", () => {
  beforeEach(() => {
    vi.mocked(acknowledgeDocument).mockResolvedValue({});
    vi.mocked(withdrawDocumentAcknowledgement).mockResolvedValue({});
    vi.mocked(deferInitialDocument).mockResolvedValue({});
    vi.mocked(removeDocumentDraftFile).mockResolvedValue({});
    vi.mocked(submitDocument).mockResolvedValue({});
    vi.mocked(uploadDocument).mockResolvedValue({});
  });
  it("enables Acknowledge only with the intent ticked and the employee's own name, and unticking clears the name", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    page(true);
    const acknowledge = await screen.findByRole("button", {
      name: "Acknowledge policy",
    });
    const box = screen.getByRole("checkbox", { name: intent });
    expect(acknowledge).toHaveProperty("disabled", true);
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    fireEvent.click(box);
    expect(acknowledge).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employe" },
    });
    expect(acknowledge).toHaveProperty("disabled", true);
    // Case, doubled and surrounding whitespace do not count against the name.
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "  test   EMPLOYEE " },
    });
    expect(acknowledge).toHaveProperty("disabled", false);
    fireEvent.click(box);
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    fireEvent.click(box);
    expect(screen.getByLabelText("Type your full name")).toHaveProperty(
      "value",
      "",
    );
    expect(acknowledge).toHaveProperty("disabled", true);
  });
  it("sends the name as typed with the content digest and one idempotency key, reused when the call is rejected", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    vi.mocked(acknowledgeDocument)
      .mockRejectedValueOnce(new Error("Signature service unavailable"))
      .mockResolvedValue({});
    const { invalidate } = page(true);
    const acknowledge = await screen.findByRole("button", {
      name: "Acknowledge policy",
    });
    fireEvent.click(screen.getByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "  test   EMPLOYEE " },
    });
    fireEvent.click(acknowledge);
    await screen.findByText("Signature service unavailable");
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(acknowledge);
    await waitFor(() => expectRefreshed(invalidate));
    expect(acknowledgeDocument).toHaveBeenCalledTimes(2);
    const [first, second] = vi
      .mocked(acknowledgeDocument)
      .mock.calls.map((call) => call[2]);
    expect(first).toEqual({
      revision: 1,
      // Only the comparison is normalised; the name travels as typed.
      typed_name: "  test   EMPLOYEE ",
      content_digest: digest,
      idempotency_key: expect.stringMatching(uuid),
    });
    expect(second).toEqual(first);
    expect(acknowledgeDocument).toHaveBeenCalledWith(
      employee,
      "requirement",
      first,
    );
  });
  it("clears the acknowledgement form once the refetched document carries a new revision, and the next attempt gets a fresh key", async () => {
    vi.mocked(getDocument).mockResolvedValue(policyDetail());
    page(true);
    await screen.findByRole("button", { name: "Acknowledge policy" });
    const sign = () => {
      fireEvent.click(screen.getByRole("checkbox", { name: intent }));
      fireEvent.change(screen.getByLabelText("Type your full name"), {
        target: { value: "Test Employee" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Acknowledge policy" }),
      );
    };
    // The server would also attach evidence; leaving it out keeps the form on
    // screen, so only the remount can explain the emptied name.
    const after = policyDetail();
    after.obligation.revision = 2;
    vi.mocked(getDocument).mockResolvedValue(after);
    sign();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
        "checked",
        false,
      ),
    );
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
    const again = policyDetail();
    again.obligation.revision = 3;
    vi.mocked(getDocument).mockResolvedValue(again);
    sign();
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
        "checked",
        false,
      ),
    );
    const [first, second] = vi
      .mocked(acknowledgeDocument)
      .mock.calls.map((call) => call[2]);
    expect(second).toMatchObject({ revision: 2 });
    expect(second!.idempotency_key).not.toBe(first!.idempotency_key);
  });
  it("withdraws an acknowledgement when evidence exists and the policy allows it", async () => {
    const doc = policyDetail(evidence);
    doc.policy!.can_withdraw = true;
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    await screen.findByText(/Acknowledged by Test Employee on/);
    expect(
      screen.queryByRole("button", { name: "Acknowledge policy" }),
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw acknowledgement" }),
    );
    await waitFor(() =>
      expect(withdrawDocumentAcknowledgement).toHaveBeenCalledWith(
        employee,
        "requirement",
        1,
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it.each<[string, boolean, boolean, boolean]>([
    ["the policy forbids it", true, false, true],
    ["nothing has been acknowledged", false, true, true],
    ["the viewer is a manager", true, true, false],
  ])("hides Withdraw when %s", async (_, acknowledged, canWithdraw, selfOnly) => {
    const doc = policyDetail(acknowledged ? evidence : null);
    doc.policy!.can_withdraw = canWithdraw;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(selfOnly);
    await screen.findByText("Be kind.");
    expect(
      screen.queryByRole("button", { name: "Withdraw acknowledgement" }),
    ).toBeNull();
  });
  it.each<[string, DocumentDetail["initial_deferral"], boolean]>([
    ["the detail carries none", undefined, false],
    ["it is not allowed", { allowed: false, reason: null }, false],
    ["publication is paused", { allowed: true, reason: null }, true],
  ])("hides the initial deferral when %s", async (_, deferral, paused) => {
    const doc = missing();
    doc.initial_deferral = deferral;
    doc.obligation.publication_paused = paused;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    await screen.findByRole("heading", { name: "Safety certificate" });
    expect(
      screen.queryByRole("group", { name: "Provide this document later" }),
    ).toBeNull();
  });
  it("saves a deferral reason only once it is non-blank and changed", async () => {
    const doc = missing();
    doc.initial_deferral = { allowed: true, reason: "Waiting for the embassy" };
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    const group = await screen.findByRole("group", {
      name: "Provide this document later",
    });
    const save = within(group).getByRole("button", { name: "Save reason" });
    const reason = within(group).getByLabelText("Reason");
    expect(reason).toHaveProperty("value", "Waiting for the embassy");
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, { target: { value: "   " } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, { target: { value: "Waiting for the embassy" } });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(reason, {
      target: { value: "Embassy appointment moved to October" },
    });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(deferInitialDocument).toHaveBeenCalledWith(
        employee,
        "requirement",
        { revision: 1, reason: "Embassy appointment moved to October" },
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("removes a file only from a draft version", async () => {
    const doc = withDraft();
    doc.obligation.status = "rejected";
    doc.submissions[0]!.version = 2;
    doc.submissions.unshift({
      ...detail().submissions[0]!,
      id: "rejected",
      state: "rejected",
      files: [
        { ...detail().submissions[0]!.files[0]!, id: "old", filename: "old.pdf" },
      ],
    });
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove certificate.pdf" }),
    );
    expect(screen.queryByRole("button", { name: "Remove old.pdf" })).toBeNull();
    await waitFor(() =>
      expect(removeDocumentDraftFile).toHaveBeenCalledWith(
        employee,
        "requirement",
        { revision: 1, submission_id: "submission", file_id: "file" },
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("never offers to remove a draft file on the manager's surface", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    page();
    await screen.findByText("certificate.pdf");
    expect(
      screen.queryByRole("button", { name: "Remove certificate.pdf" }),
    ).toBeNull();
  });
  it("submits the draft with its expiry date and extra fields", async () => {
    const doc = withDraft();
    doc.obligation.tracks_expiry = true;
    doc.obligation.settings.extra_fields = [
      { key: "license_number", label: "License number", kind: "text", required: true },
      { key: "hours", label: "Training hours", kind: "number", required: false },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    const { invalidate } = page(true);
    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    fireEvent.change(screen.getByLabelText("Expiration date (required)"), {
      target: { value: "2027-03-31" },
    });
    fireEvent.change(screen.getByLabelText("License number (required)"), {
      target: { value: "A-123" },
    });
    fireEvent.change(screen.getByLabelText("Training hours"), {
      target: { value: "8" },
    });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 1,
        submission_id: "submission",
        expiry_date: "2027-03-31",
        // Number fields travel as the typed string; nothing converts them.
        metadata: { license_number: "A-123", hours: "8" },
      }),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it("submits a null expiry date when none is typed, and refreshes only once it succeeds", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    vi.mocked(submitDocument)
      .mockRejectedValueOnce(new Error("Submit unavailable"))
      .mockResolvedValue(undefined);
    const { invalidate } = page(true);

    const submit = await screen.findByRole("button", {
      name: "Submit document",
    });
    fireEvent.click(submit);
    await screen.findByText("Submit unavailable");
    // A failed mutation must not tell the rest of the app the document moved.
    expect(invalidate).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 1,
        submission_id: "submission",
        expiry_date: null,
        metadata: {},
      }),
    );
    expectRefreshed(invalidate);
  });
  it("keeps Submit disabled while the draft has no kept file", async () => {
    const doc = withDraft();
    doc.submissions[0]!.files[0]!.decision = "discard";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    expect(
      await screen.findByRole("button", { name: "Submit document" }),
    ).toHaveProperty("disabled", true);
  });
  it("retries a failed upload with the same file, accepts the jpeg extensions and clears the picker after a pick", async () => {
    const doc = withDraft();
    doc.obligation.accepted_formats = ["pdf", "jpeg"];
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(uploadDocument)
      .mockRejectedValueOnce(new Error("Upload unavailable"))
      .mockResolvedValue({});
    const { invalidate } = page(true);
    const input = await screen.findByLabelText("Upload document");
    expect(input.getAttribute("accept")).toBe(".pdf,.jpg,.jpeg");
    expect(screen.getByText(/PDF, JPEG, up to 10 MiB/)).toBeTruthy();
    // jsdom never sets a fakepath on a file input, so a plain property stands
    // in for the browser-held selection the drawer must clear after the pick.
    Object.defineProperty(input, "value", {
      configurable: true,
      writable: true,
      value: "C:\\fakepath\\replacement.jpg",
    });
    const file = new File(["jpg"], "replacement.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(input).toHaveProperty("value", "");
    await screen.findByText(/replacement\.jpg could not be uploaded/);
    await screen.findByText("Upload unavailable");
    expect(invalidate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry upload" }));
    await waitFor(() =>
      expect(uploadDocument).toHaveBeenNthCalledWith(
        2,
        employee,
        "requirement",
        1,
        file,
      ),
    );
    const calls = vi.mocked(uploadDocument).mock.calls;
    expect(calls[1]![3]).toBe(calls[0]![3]);
    await waitFor(() => {
      expectRefreshed(invalidate);
      expect(screen.queryByText(/could not be uploaded/)).toBeNull();
      expect(screen.queryByText("Upload unavailable")).toBeNull();
      expect(
        screen.getByRole("button", { name: "Submit document" }),
      ).toHaveProperty("disabled", false);
    });
  });
  it("drops a failed upload and its error without touching the server", async () => {
    vi.mocked(getDocument).mockResolvedValue(withDraft());
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload unavailable"));
    const { invalidate } = page(true);
    fireEvent.change(await screen.findByLabelText("Upload document"), {
      target: {
        files: [
          new File(["pdf"], "replacement.pdf", { type: "application/pdf" }),
        ],
      },
    });
    await screen.findByText("Upload unavailable");
    fireEvent.click(
      screen.getByRole("button", { name: "Remove failed upload" }),
    );
    expect(screen.queryByText(/could not be uploaded/)).toBeNull();
    await waitFor(() =>
      expect(screen.queryByText("Upload unavailable")).toBeNull(),
    );
    expect(uploadDocument).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });
  it.each(closed)(
    "hides upload and submit from the employee when the document is %s",
    async (status) => {
      const doc = withDraft();
      doc.obligation.status = status;
      vi.mocked(getDocument).mockResolvedValue(doc);
      page(true);
      await screen.findByText("certificate.pdf");
      expect(screen.queryByLabelText("Upload document")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Submit document" }),
      ).toBeNull();
      // The draft's own Remove button is not behind this gate today.
      expect(
        screen.getByRole("button", { name: "Remove certificate.pdf" }),
      ).toBeTruthy();
    },
  );
  it.each(closed)(
    "hides the acknowledgement form from the employee when the policy is %s",
    async (status) => {
      const doc = policyDetail();
      doc.obligation.status = status;
      vi.mocked(getDocument).mockResolvedValue(doc);
      page(true);
      await screen.findByText("Be kind.");
      expect(screen.queryByRole("checkbox")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Acknowledge policy" }),
      ).toBeNull();
      expect(
        screen.getByRole("button", { name: "Download policy copy" }),
      ).toBeTruthy();
    },
  );
});

// U59: the expiry date and the extra fields are stored nowhere until Submit,
// and uploading, removing a file or deferring each bump the revision first.
describe("typed draft fields", () => {
  beforeEach(() => {
    vi.mocked(deferInitialDocument).mockResolvedValue({});
    vi.mocked(removeDocumentDraftFile).mockResolvedValue({});
    vi.mocked(submitDocument).mockResolvedValue({});
    vi.mocked(uploadDocument).mockResolvedValue({});
  });
  const back = {
    ...detail().submissions[0]!.files[0]!,
    id: "back",
    filename: "back.pdf",
  };
  function licensed(revision = 1) {
    const doc = withDraft();
    doc.obligation.revision = revision;
    doc.obligation.tracks_expiry = true;
    doc.obligation.settings.extra_fields = [
      { key: "license_number", label: "License number", kind: "text", required: true },
    ];
    doc.initial_deferral = { allowed: true, reason: null };
    return doc;
  }
  // A correction draft opens with what the rejected version carried.
  function correction(revision = 1) {
    const doc = licensed(revision);
    doc.submissions[0]!.id = "correction";
    doc.submissions[0]!.expiry_date = "2026-12-31";
    doc.submissions[0]!.metadata = { license_number: "B-9" };
    return doc;
  }
  const fields = () => ({
    expiry: (
      screen.getByLabelText("Expiration date (required)") as HTMLInputElement
    ).value,
    license: (
      screen.getByLabelText("License number (required)") as HTMLInputElement
    ).value,
  });
  const typed = { expiry: "2027-03-31", license: "A-123" };
  async function type() {
    await screen.findByRole("button", { name: "Submit document" });
    fireEvent.change(screen.getByLabelText("Expiration date (required)"), {
      target: { value: typed.expiry },
    });
    fireEvent.change(screen.getByLabelText("License number (required)"), {
      target: { value: typed.license },
    });
  }
  const pick = () =>
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [new File(["pdf"], "back.pdf", { type: "application/pdf" })],
      },
    });
  const close = () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Close document details" }),
    );

  it("keeps them through a second upload and submits them with the new revision", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    page(true);
    await type();
    const after = licensed(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    expect(fields()).toEqual(typed);
    fireEvent.click(screen.getByRole("button", { name: "Submit document" }));
    await waitFor(() =>
      expect(submitDocument).toHaveBeenCalledWith(employee, "requirement", {
        revision: 2,
        submission_id: "submission",
        expiry_date: "2027-03-31",
        metadata: { license_number: "A-123" },
      }),
    );
  });
  it("keeps them when a draft file is removed", async () => {
    const before = licensed();
    before.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(before);
    page(true);
    await type();
    vi.mocked(getDocument).mockResolvedValue(licensed(2));
    fireEvent.click(screen.getByRole("button", { name: "Remove back.pdf" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "back.pdf" })).toBeNull(),
    );
    expect(fields()).toEqual(typed);
  });
  it("keeps them when the deferral reason is saved", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    page(true);
    await type();
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "Embassy appointment moved" },
    });
    const after = licensed(2);
    after.initial_deferral = { allowed: true, reason: "Embassy appointment moved" };
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.click(screen.getByRole("button", { name: "Save reason" }));
    // Save is off because the reason is now the saved one, while Submit is
    // back on: only the rebuilt content shows both.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save reason" }),
      ).toHaveProperty("disabled", true);
      expect(
        screen.getByRole("button", { name: "Submit document" }),
      ).toHaveProperty("disabled", false);
    });
    expect(fields()).toEqual(typed);
  });
  it("still asks before closing once a command has gone through", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    const { onClose } = page(true);
    await type();
    const after = licensed(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    close();
    expect(await screen.findByText("Discard unsaved changes?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
  it("keeps them when the upload fails", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    vi.mocked(uploadDocument).mockRejectedValue(new Error("Upload unavailable"));
    page(true);
    await type();
    pick();
    await screen.findByText("Upload unavailable");
    expect(fields()).toEqual(typed);
  });
  it("shows the draft's saved values while nothing is typed, across a command", async () => {
    vi.mocked(getDocument).mockResolvedValue(correction());
    const { onClose } = page(true);
    await screen.findByRole("button", { name: "Submit document" });
    const saved = { expiry: "2026-12-31", license: "B-9" };
    expect(fields()).toEqual(saved);
    const after = correction(2);
    after.submissions[0]!.files.push(back);
    vi.mocked(getDocument).mockResolvedValue(after);
    pick();
    await screen.findByRole("button", { name: "back.pdf" });
    expect(fields()).toEqual(saved);
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("drops them when the document comes back with another draft", async () => {
    vi.mocked(getDocument).mockResolvedValue(licensed());
    const { cache, onClose } = page(true);
    await type();
    // Submitted in another tab, rejected, reopened as a correction draft.
    vi.mocked(getDocument).mockResolvedValue(correction(2));
    await cache.invalidateQueries();
    await waitFor(() =>
      expect(fields()).toEqual({ expiry: "2026-12-31", license: "B-9" }),
    );
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("drops them when the drawer moves to another document and back", async () => {
    const other = correction();
    other.obligation.id = "other";
    vi.mocked(getDocument).mockImplementation(async (_audience, id) =>
      id === "other" ? other : licensed(),
    );
    const { show } = page(true);
    await type();
    show("other");
    await waitFor(() =>
      expect(fields()).toEqual({ expiry: "2026-12-31", license: "B-9" }),
    );
    show("requirement");
    await waitFor(() => expect(fields()).toEqual({ expiry: "", license: "" }));
  });
});
