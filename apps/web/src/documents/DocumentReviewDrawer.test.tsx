import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultDocumentLifecycleSettings,
  type DocumentDetail,
  type DocumentObligation,
} from "@newfork/shared";
import { DocumentReviewDrawer } from "./DocumentReviewDrawer";
import { createReviewSitting, type ReviewSitting } from "./review-sitting";
import { RequestError } from "../lib/request-error";
import {
  acknowledgeDocument,
  deferInitialDocument,
  downloadDocument,
  extendDocumentDeadline,
  getDocument,
  removeDocumentDraftFile,
  reviewDocument,
  setDocumentExemption,
  setDocumentTimezone,
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
// A row of the manager's list, as the drawer's queue holds it.
const row = (over: Partial<DocumentObligation> = {}): DocumentObligation => ({
  ...detail().obligation,
  ...over,
});
function page(
  selfOnly = false,
  extra: { queue?: DocumentObligation[]; sitting?: ReviewSitting } = {},
) {
  const onClose = vi.fn(),
    onNext = vi.fn(),
    onOpen = vi.fn();
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
        onOpen={onOpen}
        queue={extra.queue}
        sitting={extra.sitting}
      />
    </QueryClientProvider>
  );
  const { rerender, unmount } = render(drawer("requirement"));
  // The list keeps one drawer mounted and only changes which document it shows.
  const show = (requirementId: string) => rerender(drawer(requirementId));
  // Closed, then opened again from the list on the same page.
  const reopen = (requirementId = "requirement") => {
    unmount();
    return render(drawer(requirementId));
  };
  return { onClose, onNext, onOpen, invalidate, cache, show, reopen };
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
  // BL-832 (KK-180 (2)): a reason typed and then left for Approve stays out of
  // the approval and its history line.
  it("sends no rejection reason with an approval", async () => {
    page();
    fireEvent.change(await screen.findByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(
        expect.anything(),
        "requirement",
        expect.objectContaining({ decision: "approve", reason: "" }),
      ),
    );
  });

  // BL-828 (KK-180 (2)): Zeynep approves a card Mert already decided; the
  // drawer reloads and says so instead of the server's "refresh required".
  it("reloads the drawer and says so when the document changed meanwhile", async () => {
    const { invalidate } = page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("document changed; refresh required", "document.changed", undefined, 409),
    );
    const decided = detail();
    decided.obligation.revision = 2;
    decided.obligation.status = "completed";
    decided.submissions[0]!.state = "accepted";
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    vi.mocked(getDocument).mockResolvedValue(decided);

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("document changed; refresh required")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["document-lifecycle", "user", "workspace"],
    });
  });
  // BL-1028: the database names the kind of 409. "Changed meanwhile" says so
  // even when the reload looks the same, and never shows the server's sentence.
  it("says the document changed by its key, whatever the reload brings", async () => {
    page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("document changed; refresh required", "document.changed", undefined, 409),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("document changed; refresh required")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  // A standing refusal is also a 409 ("changes are paused"); nothing changed,
  // so there is nothing to reload and the refusal's own sentence stays, even
  // when somebody else's change lands at the same time.
  it("keeps a standing 409 refusal's sentence and claims no change", async () => {
    const { invalidate } = page();
    const later = detail();
    later.obligation.revision = 2;
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("Document is unpublished; changes are paused", "document.paused", undefined, 409),
    );
    vi.mocked(getDocument).mockResolvedValueOnce(detail()).mockResolvedValue(later);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Document is unpublished; changes are paused",
    );
    expect(
      screen.queryByText("This document changed. You're seeing the latest version."),
    ).toBeNull();
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: ["document-lifecycle", "user", "workspace"],
    });
  });
  it("words a failed save for the person, not the server", async () => {
    page();
    vi.mocked(reviewDocument).mockRejectedValueOnce(
      new RequestError("Internal server error", undefined, undefined, 500),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Couldn't save. Try again.",
    );
  });

  // BL-830 (KK-180 (2)): the version heading and a file's decision read as the
  // list does, never the stored code.
  it("names a version's state and a file's decision in words", async () => {
    const shown = detail();
    shown.obligation.status = "completed";
    shown.obligation.submitted_id = null;
    shown.submissions[0]!.state = "superseded";
    shown.submissions[0]!.files[0]!.decision = "discard";
    vi.mocked(getDocument).mockResolvedValue(shown);
    page(true);

    expect(
      await screen.findByRole("heading", { name: "Version 1 · Replaced" }),
    ).toBeTruthy();
    expect(screen.getByText("Discarded")).toBeTruthy();
    expect(screen.queryByText("discard")).toBeNull();
  });

  it("requires rejection reason, disables exhausted remaining time, keeps the drawer open and advances only on Next", async () => {
    const { onClose, onOpen } = page(false, {
      queue: [row(), row({ id: "second", employee_id: "other", employee_name: "Sam Lee" })],
    });
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
      screen.getByRole("dialog", { name: "Test Employee · Safety certificate" }),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next: Sam Lee" }));
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
  });
  it("requires an exemption reason and locks parent navigation while the action is being confirmed", async () => {
    const { onClose } = page(false, {
      queue: [row(), row({ id: "second", employee_id: "other", employee_name: "Sam Lee" })],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: "Exempt from this document" }),
    );
    expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Close details" })).toHaveProperty(
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
      // BL-834: in the person's words, not the rule's.
      await screen.findByText(
        "Owners aren't required to submit documents. Uploading is optional.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Remove exemption" }),
    ).toBeNull();
  });

  it("names the status the way the list does", async () => {
    page();
    expect(await screen.findByText("Needs review")).toBeTruthy();
    expect(screen.queryByText("pending review")).toBeNull();
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

// BL-1014: the decision can move the person out of Onboarding; the Employees list
// and the person's drawer read it again instead of keeping the old status.
it("refreshes the Employees list and the person's drawer after a decision", async () => {
  const { invalidate } = page();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(reviewDocument).toHaveBeenCalledWith(
      expect.anything(),
      "requirement",
      expect.objectContaining({ decision: "approve" }),
    ),
  );
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employees", "workspace"] }),
  );
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["employee-detail", "workspace"] });
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

  // BL-118 / D5: the owner is never asked, but may keep a copy on file.
  function excused(doc: DocumentDetail) {
    doc.obligation.status = "exempt";
    doc.obligation.exemption_locked = true;
    doc.obligation.mode = "optional";
    return doc;
  }
  it("lets the owner upload to their excused document and says it needs no review", async () => {
    vi.mocked(getDocument).mockResolvedValue(excused(missing()));
    page(true);
    const picker = await screen.findByLabelText("Upload document");
    expect(
      screen.getByText("Optional for you; what you submit goes on file without review."),
    ).toBeTruthy();
    const file = new File(["pdf"], "food-handler.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(picker, { target: { files: [file] } });
    await waitFor(() =>
      expect(uploadDocument).toHaveBeenCalledWith(
        employee,
        "requirement",
        1,
        file,
      ),
    );
  });
  it("lets the owner submit the draft of their excused document", async () => {
    vi.mocked(getDocument).mockResolvedValue(excused(withDraft()));
    page(true);
    fireEvent.click(
      await screen.findByRole("button", { name: "Submit document" }),
    );
    await waitFor(() => expect(submitDocument).toHaveBeenCalledOnce());
  });
  it("reads on file once the owner's copy is accepted, and still takes a newer one", async () => {
    const doc = excused(detail());
    doc.obligation.submitted_id = "submission";
    doc.obligation.approved_id = "submission";
    doc.submissions[0]!.state = "accepted";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(true);
    expect(await screen.findByText("On file")).toBeTruthy();
    expect(screen.queryByText("Exempt")).toBeNull();
    expect(screen.getByLabelText("Upload document")).toBeTruthy();
  });
});

// S2: a reviewer who cannot decide gets the row as its approved copy, or as
// missing, with the unreviewed upload, its reason and its file left out.
describe("a row whose unreviewed upload is hidden", () => {
  it("shows the approved copy and nothing to decide", async () => {
    const doc = detail();
    doc.obligation.status = "completed";
    doc.obligation.submitted_id = null;
    doc.obligation.approved_id = "submission";
    doc.obligation.remaining_seconds = null;
    doc.submissions[0]!.state = "accepted";
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(
      await screen.findByRole("heading", { name: "Version 1 · Approved" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });
  it("shows a never-approved row as missing, with no reason and no version", async () => {
    const doc = missing();
    doc.obligation.remaining_seconds = null;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(await screen.findByText("Missing")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^Version/ })).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined/);
  });
});

it("says in one sentence when the document is not theirs to open", async () => {
  vi.mocked(getDocument).mockRejectedValue(
    new RequestError("Not allowed", "authz.out_of_scope", undefined, 404),
  );
  page();
  expect(
    await screen.findByText("You don't have access to this document."),
  ).toBeTruthy();
  expect(screen.queryByText("Not allowed")).toBeNull();
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

// U60: the three commands no test reached. Two are the manager's alone.
describe("download, document time zone and deadline extension", () => {
  const manager = { workspaceId: "workspace", selfOnly: false };
  it("downloads a file by its version and file, and refreshes nothing", async () => {
    const doc = detail();
    doc.submissions[0]!.files.push({
      ...doc.submissions[0]!.files[0]!,
      id: "discarded",
      filename: "blurry.pdf",
      decision: "discard",
    });
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(downloadDocument)
      .mockRejectedValueOnce(new Error("Link unavailable"))
      .mockResolvedValue(undefined);
    const { invalidate } = page();
    const file = await screen.findByRole("button", { name: "certificate.pdf" });
    // A discarded file is listed but no longer handed out.
    expect(screen.getByRole("button", { name: "blurry.pdf" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(file);
    await screen.findByText("Link unavailable");
    fireEvent.click(file);
    await waitFor(() => expect(downloadDocument).toHaveBeenCalledTimes(2));
    expect(downloadDocument).toHaveBeenLastCalledWith(
      manager,
      "requirement",
      "submission",
      "file",
    );
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("saves a changed document time zone against the employee's revision, then refreshes", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: "America/Chicago",
      configured_value: "America/Chicago",
      employee_revision: 4,
      can_manage: true,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(setDocumentTimezone).mockResolvedValue({});
    const { invalidate } = page();
    const save = await screen.findByRole("button", {
      name: "Save document time zone",
    });
    expect(save).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(setDocumentTimezone).toHaveBeenCalledWith(manager, "requirement", {
        employee_revision: 4,
        timezone: "America/Denver",
      }),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  // BL-828: someone changed the person's record first; the document revision
  // is the same, the person's is newer. The drawer reloads and says so.
  it("says the document changed when the person's record moved on before a time zone save", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: "America/Chicago",
      configured_value: "America/Chicago",
      employee_revision: 4,
      can_manage: true,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(setDocumentTimezone).mockRejectedValueOnce(
      new RequestError("employee changed; refresh required", "employee.revision_conflict", undefined, 409),
    );
    page();
    fireEvent.change(await screen.findByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    const later = detail();
    later.timezone_settings = { ...doc.timezone_settings, employee_revision: 5 };
    vi.mocked(getDocument).mockResolvedValue(later);
    fireEvent.click(screen.getByRole("button", { name: "Save document time zone" }));

    expect(
      await screen.findByText("This document changed. You're seeing the latest version."),
    ).toBeTruthy();
    expect(screen.queryByText("employee changed; refresh required")).toBeNull();
  });
  it("hides the document time zone from whoever cannot manage it", async () => {
    const doc = detail();
    doc.timezone_settings = {
      value: null,
      configured_value: null,
      employee_revision: 4,
      can_manage: false,
    };
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    await screen.findByText("certificate.pdf");
    expect(
      screen.queryByRole("button", { name: "Save document time zone" }),
    ).toBeNull();
  });
  it("extends the deadline with the days and reason typed, then refreshes", async () => {
    const doc = missing();
    doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
    vi.mocked(getDocument).mockResolvedValue(doc);
    vi.mocked(extendDocumentDeadline).mockResolvedValue({});
    const { invalidate } = page();
    const extend = await screen.findByRole("button", {
      name: "Extend deadline",
    });
    // A reason is required; the days default to one.
    expect(extend).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Additional days"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Extension reason"), {
      target: { value: "Clinic closed this week" },
    });
    expect(extend).toHaveProperty("disabled", false);
    fireEvent.click(extend);
    await waitFor(() =>
      expect(extendDocumentDeadline).toHaveBeenCalledWith(
        manager,
        "requirement",
        { revision: 1, additional_days: 5, reason: "Clinic closed this week" },
      ),
    );
    await waitFor(() => expectRefreshed(invalidate));
  });
  it.each<[string, (doc: DocumentDetail) => void, boolean]>([
    ["the deadline has passed", (doc) => {
      doc.obligation.deadline_at = "2020-01-01T00:00:00Z";
    }, false],
    ["the document is waiting for review", (doc) => {
      doc.obligation.status = "pending_review";
    }, false],
    ["the viewer is the employee", () => undefined, true],
  ])("offers no deadline extension when %s", async (_, change, selfOnly) => {
    const doc = missing();
    doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
    change(doc);
    vi.mocked(getDocument).mockResolvedValue(doc);
    page(selfOnly);
    await screen.findByRole("dialog", { name: /Safety certificate/ });
    await screen.findByText(selfOnly ? "Upload a new version" : "Name");
    expect(screen.queryByRole("button", { name: "Extend deadline" })).toBeNull();
  });
});

// BL-467: everything else typed into the drawer survives a new revision the
// same way (another command, someone else's change), until its own command
// uses it or the thing it was typed for is replaced.
describe("typed fields beyond the draft", () => {
  const manager = { workspaceId: "workspace", selfOnly: false };
  const value = (label: string) =>
    (screen.getByLabelText(label) as HTMLInputElement).value;
  let base: () => DocumentDetail = detail;
  // Someone else's change: the same document comes back one revision later.
  async function bump(
    cache: QueryClient,
    change: (doc: DocumentDetail) => void,
  ) {
    const calls = vi.mocked(getDocument).mock.calls.length;
    vi.mocked(getDocument).mockImplementation(async () => {
      const doc = base();
      doc.obligation.revision = 2;
      change(doc);
      return doc;
    });
    await cache.invalidateQueries();
    await waitFor(() =>
      expect(vi.mocked(getDocument).mock.calls.length).toBeGreaterThan(calls),
    );
  }
  const close = () =>
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));

  it("keeps the rejection reason, correction period and file decisions through a new revision and a close, sending nothing until Reject", async () => {
    base = () => {
      const doc = detail();
      doc.obligation.remaining_seconds = 3600;
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache, onClose, reopen } = page(false, { sitting: createReviewSitting() });
    await screen.findByRole("button", { name: "Reject" });
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    fireEvent.change(screen.getByLabelText("Correction period"), {
      target: { value: "remaining" },
    });
    fireEvent.change(screen.getByLabelText("Decision for certificate.pdf"), {
      target: { value: "discard" },
    });
    fireEvent.change(screen.getByLabelText("Note for certificate.pdf"), {
      target: { value: "Blurry" },
    });
    await bump(cache, () => undefined);
    await waitFor(() => expect(value("Rejection reason")).toBe("Unreadable"));
    expect(value("Correction period")).toBe("remaining");
    expect(value("Decision for certificate.pdf")).toBe("discard");
    expect(value("Note for certificate.pdf")).toBe("Blurry");
    // K1 decision 5: closing asks nothing and sends nothing; the draft waits with its document.
    close();
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByText("Discard unsaved changes?")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(reviewDocument).not.toHaveBeenCalled();
    reopen();
    await waitFor(() => expect(value("Rejection reason")).toBe("Unreadable"));
    expect(value("Correction period")).toBe("remaining");
    expect(value("Decision for certificate.pdf")).toBe("discard");
    expect(value("Note for certificate.pdf")).toBe("Blurry");
    expect(reviewDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(reviewDocument).toHaveBeenCalledWith(manager, "requirement", {
        revision: 2,
        submission_id: "submission",
        decision: "reject",
        reason: "Unreadable",
        correction_period: "remaining",
        files: [{ id: "file", decision: "discard", note: "Blurry" }],
      }),
    );
  });
  it("drops the review typed for a version once another version is under review", async () => {
    base = detail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page();
    fireEvent.change(await screen.findByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    await bump(cache, (doc) => {
      doc.obligation.submitted_id = "resubmitted";
      doc.submissions[0]!.id = "resubmitted";
    });
    await waitFor(() => expect(value("Rejection reason")).toBe(""));
  });
  it("keeps an unsaved deferral reason through an upload", async () => {
    base = () => {
      const doc = withDraft();
      doc.initial_deferral = { allowed: true, reason: null };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    vi.mocked(uploadDocument).mockResolvedValue({});
    page(true);
    fireEvent.change(await screen.findByLabelText("Reason"), {
      target: { value: "Embassy appointment moved" },
    });
    const after = base();
    after.obligation.revision = 2;
    after.submissions[0]!.files.push({
      ...after.submissions[0]!.files[0]!,
      id: "back",
      filename: "back.pdf",
    });
    vi.mocked(getDocument).mockResolvedValue(after);
    fireEvent.change(screen.getByLabelText("Upload document"), {
      target: {
        files: [new File(["pdf"], "back.pdf", { type: "application/pdf" })],
      },
    });
    await screen.findByRole("button", { name: "back.pdf" });
    expect(value("Reason")).toBe("Embassy appointment moved");
  });
  it("keeps the extension typed through a time zone change, and clears it once the extension is saved", async () => {
    base = () => {
      const doc = missing();
      doc.obligation.deadline_at = new Date(Date.now() + 86_400_000).toISOString();
      doc.timezone_settings = {
        value: "America/Chicago",
        configured_value: "America/Chicago",
        employee_revision: 4,
        can_manage: true,
      };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    vi.mocked(setDocumentTimezone).mockResolvedValue({});
    vi.mocked(extendDocumentDeadline).mockResolvedValue({});
    const { cache, onClose } = page();
    await screen.findByRole("button", { name: "Extend deadline" });
    fireEvent.change(screen.getByLabelText("Additional days"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("Extension reason"), {
      target: { value: "Clinic closed this week" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    // The time zone is its own command; the extension waits on screen.
    fireEvent.click(
      screen.getByRole("button", { name: "Save document time zone" }),
    );
    await waitFor(() => expect(setDocumentTimezone).toHaveBeenCalled());
    await bump(cache, (doc) => {
      doc.timezone_settings!.configured_value = "America/Denver";
      doc.timezone_settings!.employee_revision = 5;
    });
    await waitFor(() => expect(value("Additional days")).toBe("5"));
    expect(value("Extension reason")).toBe("Clinic closed this week");
    fireEvent.click(screen.getByRole("button", { name: "Extend deadline" }));
    await waitFor(() =>
      expect(extendDocumentDeadline).toHaveBeenCalledWith(
        manager,
        "requirement",
        { revision: 2, additional_days: 5, reason: "Clinic closed this week" },
      ),
    );
    // Used up: the form is back to its start and nothing is left to discard.
    await waitFor(() => expect(value("Extension reason")).toBe(""));
    expect(value("Additional days")).toBe("1");
    close();
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("keeps a chosen document time zone through a new revision", async () => {
    base = () => {
      const doc = detail();
      doc.timezone_settings = {
        value: null,
        configured_value: null,
        employee_revision: 4,
        can_manage: true,
      };
      return doc;
    };
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page();
    fireEvent.change(await screen.findByRole("combobox", { name: "Time zone" }), {
      target: { value: "America/Denver" },
    });
    await bump(cache, () => undefined);
    await waitFor(() =>
      expect(
        (screen.getByRole("combobox", { name: "Time zone" }) as HTMLSelectElement)
          .value,
      ).toBe("America/Denver"),
    );
  });
  it("keeps the ticked intent and typed name through a new revision of the same policy text", async () => {
    base = policyDetail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employee" },
    });
    await bump(cache, () => undefined);
    await waitFor(() => expect(value("Type your full name")).toBe("Test Employee"));
    expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
      "checked",
      true,
    );
  });
  it("drops the signature once the policy text itself changed", async () => {
    base = policyDetail;
    vi.mocked(getDocument).mockResolvedValue(base());
    const { cache } = page(true);
    fireEvent.click(await screen.findByRole("checkbox", { name: intent }));
    fireEvent.change(screen.getByLabelText("Type your full name"), {
      target: { value: "Test Employee" },
    });
    await bump(cache, (doc) => {
      doc.policy!.content_text = "Be kind, and be on time.";
      doc.policy!.content_digest = "b".repeat(64);
    });
    await screen.findByText("Be kind, and be on time.");
    expect(screen.getByRole("checkbox", { name: intent })).toHaveProperty(
      "checked",
      false,
    );
    expect(screen.queryByLabelText("Type your full name")).toBeNull();
  });
});

// Loading and error in the "B" look (Mert 2026-10-14).
it("outlines the document while it loads", async () => {
  vi.mocked(getDocument).mockReturnValueOnce(new Promise(() => {}));
  page();
  expect(await screen.findByText("Loading document")).toBeTruthy();
  expect(screen.queryByText("Loading document…")).toBeNull();
});

it("shows the load-error card with Try again, not the server's sentence", async () => {
  vi.mocked(getDocument)
    .mockRejectedValueOnce(new Error("Document service unavailable"))
    .mockResolvedValue(detail());
  page();
  expect(
    await screen.findByRole("heading", { level: 3, name: "We couldn't load this document" }),
  ).toBeTruthy();
  expect(screen.queryByText("Document service unavailable")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(screen.queryByRole("heading", { name: "We couldn't load this document" })).toBeNull(),
  );
  expect(screen.queryByText("Loading document")).toBeNull();
});

// A2 Tur 6, file buttons design a (Mert 23 Oct): the manager's drawer is one card that stays open while it walks
// the list: the strip (Previous / Next and the X), the person's head, Details · History, the facts. The files, the
// dock and More options are drawn in their own slots.
describe("manager review drawer", () => {
  const sam = () =>
    row({ id: "second", employee_id: "other", employee_name: "Sam Lee", title: "Food handler card" });
  function second(): DocumentDetail {
    const doc = detail();
    doc.obligation = { ...doc.obligation, ...sam(), submitted_id: "second-submission" };
    doc.submissions[0]!.id = "second-submission";
    return doc;
  }
  beforeEach(() => {
    vi.mocked(getDocument).mockImplementation(async (_audience, id) =>
      id === "second" ? second() : detail(),
    );
  });

  it("heads the drawer with the person, the status and the document, and gives the person's name the first focus", async () => {
    page();
    const dialog = await screen.findByRole("dialog", {
      name: "Test Employee · Safety certificate",
    });
    const name = within(dialog).getByRole("heading", {
      level: 2,
      name: "Test Employee Needs review",
    });
    expect(document.activeElement).toBe(name);
    expect(dialog.querySelector(".rd-kicker")?.textContent).toBe("Safety certificate");
    await waitFor(() =>
      expect(dialog.querySelector(".rd-sub")?.textContent).toMatch(/^Sent: Tue, Sep 15/),
    );
    const tile = dialog.querySelector(".docr-avatar")!;
    expect([tile.textContent, tile.getAttribute("aria-hidden")]).toEqual(["TE", "true"]);
  });

  // K1 decision 4.
  it.each([
    ["rejected", "Missing", "red"],
    ["exempt", "Excused", "grey"],
    ["pending_review", "Needs review", "warn"],
  ] as const)("reads a %s document as %s", async (status, label, tone) => {
    const doc = detail();
    doc.obligation.status = status;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const chip = await screen.findByText(label, { selector: ".rd-chip" });
    expect(chip.className).toBe(`rd-chip ${tone}`);
  });

  it("shows the person from the list while the document loads", async () => {
    vi.mocked(getDocument).mockReturnValue(new Promise(() => {}));
    page(false, { queue: [row()] });
    expect(
      screen.getByRole("dialog", { name: "Test Employee · Safety certificate" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Test Employee Needs review" }),
    ).toBeTruthy();
    expect(await screen.findByText("Loading document")).toBeTruthy();
  });

  // K1 decisions 6 and 7: the strip walks the list as it was shown, naming the neighbour.
  it("names each neighbour by its person, or by its document when it is the same person's", async () => {
    const ana = row({ id: "first", employee_id: "ana", employee_name: "Ana Ruiz", title: "I-9" });
    const own = row({ id: "own", title: "Food handler card" });
    const { onOpen } = page(false, { queue: [ana, row(), own] });
    await screen.findByRole("dialog", { name: "Test Employee · Safety certificate" });
    const strip = screen.getByRole("navigation", { name: "Documents in this list" });
    const previous = within(strip).getByRole("button", { name: "Previous: Ana Ruiz" });
    const next = within(strip).getByRole("button", { name: "Next: Food handler card" });
    expect(previous.getAttribute("title")).toBe("Previous: Ana Ruiz · I-9");
    expect(next.getAttribute("title")).toBe("Next: Food handler card");
    expect(within(strip).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(next);
    expect(onOpen).toHaveBeenLastCalledWith("own");
    fireEvent.click(previous);
    expect(onOpen).toHaveBeenLastCalledWith("first");
  });

  it("keeps Previous and Next in place at the ends, where they do nothing", async () => {
    const { onOpen } = page(false, { queue: [row()] });
    await screen.findByRole("dialog", { name: /Safety certificate/ });
    for (const name of ["Previous", "Next"]) {
      const end = screen.getByRole("button", { name });
      expect(end.getAttribute("aria-disabled")).toBe("true");
      expect(end.textContent).toBe(name);
      fireEvent.click(end);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("stays one drawer when it moves, keeps focus on the pressed button and says where it landed", async () => {
    const { onOpen, show } = page(false, { queue: [row(), sam()] });
    const dialog = await screen.findByRole("dialog", {
      name: "Test Employee · Safety certificate",
    });
    const next = screen.getByRole("button", { name: "Next: Sam Lee" });
    next.focus();
    fireEvent.click(next);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("second");
    show("second");
    expect(
      await screen.findByRole("dialog", { name: "Sam Lee · Food handler card" }),
    ).toBe(dialog);
    expect(document.activeElement).toBe(next);
    expect(next.getAttribute("aria-label")).toBe("Next");
    expect(screen.getByRole("button", { name: "Previous: Test Employee" })).toBeTruthy();
    await waitFor(() =>
      expect(dialog.querySelector("[aria-live='polite']")?.textContent).toBe(
        "Sam Lee · Food handler card",
      ),
    );
  });

  // A2 Tur 6: a move slides the person, the tabs and the body in from its side; the strip and the dock stay.
  it.each([
    [false, "requirement", "second", "translateX(24px)", 220],
    [false, "second", "requirement", "translateX(-24px)", 220],
    [true, "requirement", "second", undefined, 120],
  ] as const)(
    "slides a move in from its side (reduced motion %s, %s to %s)",
    async (calm, from, to, transform, duration) => {
      const animate = vi.fn();
      const original = HTMLElement.prototype.animate;
      HTMLElement.prototype.animate = animate as unknown as typeof original;
      const matchMedia = window.matchMedia;
      window.matchMedia = ((query: string) => ({
        matches: calm && query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
      try {
        const { show } = page(false, { queue: [row(), sam()] });
        show(from);
        await screen.findByRole("dialog", { name: from === "second" ? /Sam Lee/ : /Test Employee/ });
        animate.mockClear();
        show(to);
        await screen.findByRole("dialog", { name: to === "second" ? /Sam Lee/ : /Test Employee/ });
        const moved = animate.mock.contexts.map((el) => (el as HTMLElement).className);
        expect(moved).toEqual(["rd-head-row", "rd-tabs", "rd-body"]);
        for (const [frames, timing] of animate.mock.calls) {
          expect(frames[0]).toEqual(transform ? { opacity: 0.2, transform } : { opacity: 0.2 });
          expect(timing).toEqual({ duration, easing: "ease-out" });
        }
      } finally {
        HTMLElement.prototype.animate = original;
        window.matchMedia = matchMedia;
      }
    },
  );

  // A2 Tur 6: the second click of the double click that opened the drawer lands on the dim; it must not close it.
  it("ignores the dim for a moment after opening", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(10_000);
    try {
      const { onClose } = page();
      await screen.findByRole("dialog", { name: /Safety certificate/ });
      const dim = document.querySelector<HTMLElement>(".catalog-drawer-backdrop")!;
      now.mockReturnValue(10_300);
      fireEvent.pointerDown(dim);
      expect(onClose).not.toHaveBeenCalled();
      now.mockReturnValue(10_600);
      fireEvent.pointerDown(dim);
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      now.mockRestore();
    }
  });

  it("closes from its X or Escape at once", async () => {
    const { onClose } = page();
    const dialog = await screen.findByRole("dialog", { name: /Safety certificate/ });
    fireEvent.click(screen.getByRole("button", { name: "Close details" }));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  // K1 decision 5: what was typed stays with its document while the drawer walks the list.
  it("keeps what was typed for a document when the drawer moves away and back", async () => {
    const { show } = page(false, { queue: [row(), sam()], sitting: createReviewSitting() });
    fireEvent.change(await screen.findByLabelText("Rejection reason"), {
      target: { value: "Unreadable" },
    });
    show("second");
    await screen.findByRole("dialog", { name: "Sam Lee · Food handler card" });
    await waitFor(() =>
      expect((screen.getByLabelText("Rejection reason") as HTMLTextAreaElement).value).toBe(""),
    );
    show("requirement");
    await waitFor(() =>
      expect((screen.getByLabelText("Rejection reason") as HTMLTextAreaElement).value).toBe(
        "Unreadable",
      ),
    );
    expect(reviewDocument).not.toHaveBeenCalled();
  });

  it("holds the strip and the X while a decision is being saved", async () => {
    vi.mocked(reviewDocument).mockReturnValue(new Promise(() => {}));
    page(false, { queue: [row(), sam()] });
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Close details" })).toHaveProperty("disabled", true),
    );
    expect(screen.getByRole("button", { name: "Next: Sam Lee" })).toHaveProperty("disabled", true);
  });

  it("has Details and History on a desktop, the files a section of Details", async () => {
    const doc = detail();
    doc.history = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        action: "document.submitted",
        occurred_at: "2026-09-15T12:00:00Z",
        metadata: {},
      },
    ];
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    const tabs = await screen.findByRole("tablist", { name: "Document sections" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Details",
      "History",
    ]);
    const files = await screen.findByRole("region", { name: "Files" });
    expect(within(files).getByRole("button", { name: "certificate.pdf" })).toBeTruthy();
    expect(screen.getByText("Name")).toBeTruthy();
    expect(screen.getByText("Test Employee", { selector: "dd" })).toBeTruthy();
    fireEvent.keyDown(within(tabs).getByRole("tab", { name: "Details" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "History" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("region", { name: "Files" })).toBeNull();
    expect(screen.getByText(/submitted/)).toBeTruthy();
  });

  it("keeps the restriction note of a suspended person in Details", async () => {
    const doc = detail();
    doc.obligation.suspended = true;
    vi.mocked(getDocument).mockResolvedValue(doc);
    page();
    expect(
      await screen.findByText(
        "Workspace access is restricted until the outstanding requirements are completed.",
      ),
    ).toBeTruthy();
  });

  describe("on a phone", () => {
    const matchMedia = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query === "(max-width: 720px)",
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = matchMedia;
    });
    it("adds a Files tab named by its count, reached from a row in Details", async () => {
      page();
      const files = await screen.findByRole("tab", { name: "Files, 1 file" });
      expect(
        screen.getAllByRole("tab").map((tab) => tab.getAttribute("aria-label") ?? tab.textContent),
      ).toEqual(["Details", "Files, 1 file", "History"]);
      expect(screen.queryByRole("button", { name: "certificate.pdf" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /^1 file to review/ }));
      expect(files.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(files);
      expect(screen.getByRole("button", { name: "certificate.pdf" })).toBeTruthy();
    });
  });
});

// K1 decision 14: a decision in the drawer also refreshes the Employee drawer's onboarding card, which reads the
// onboarding under its own key.
it("refreshes the Employee drawer's onboarding review after a decision", async () => {
  const { invalidate } = page();
  fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["employee-onboarding-review", "workspace"],
    }),
  );
});
